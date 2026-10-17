"""E-mail features: purpose tokens, forgot/reset password, verification, outbox delivery, scheduler slots, preferences.
Database-free; the SQL and the real mail server are exercised by backend/tests/live/smoke_mail.py."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.api import deps
from app.api.api_v1.endpoints import auth as auth_mod
from app.api.api_v1.endpoints import users as users_mod
from app.core import mailer, scheduler, security
from app.core.config import settings
from app.main import app


def run(coro):
    return asyncio.run(coro)


def make_user(**kw):
    hashed = kw.pop("hashed_password", security.get_password_hash("old-password-1"))
    base = dict(
        id=uuid4(), email="eve@example.com", full_name="Eve", is_active=True, is_superuser=False,
        hashed_password=hashed, email_verified_at=None,
        notify_email_assignments=True, notify_email_digest=True,
    )
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def db():
    d = MagicMock()
    d.commit, d.flush, d.refresh = AsyncMock(), AsyncMock(), AsyncMock()
    d.info = {}
    return d


@pytest.fixture
def client(db):
    async def fake_db():
        yield db

    app.dependency_overrides[deps.get_db] = fake_db
    # fresh limiters per test
    auth_mod.forgot_ip_limiter.__init__(10, 3600)
    auth_mod.forgot_email_limiter.__init__(5, 3600)
    auth_mod.verify_limiter.__init__(3, 3600)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


# ----------------------------------------------------------------------------------------------- tokens
class TestPurposeTokens:
    def test_roundtrip_and_claims(self):
        tok = security.create_purpose_token("u1", "p", timedelta(minutes=5), fp="abc")
        claims = security.decode_purpose_token(tok, "p")
        assert claims["sub"] == "u1" and claims["fp"] == "abc"

    def test_wrong_purpose_expired_garbage_and_access_tokens_are_refused(self):
        tok = security.create_purpose_token("u1", "reset", timedelta(minutes=5))
        with pytest.raises(ValueError):
            security.decode_purpose_token(tok, "verify")
        expired = security.create_purpose_token("u1", "reset", timedelta(minutes=-1))
        with pytest.raises(ValueError):
            security.decode_purpose_token(expired, "reset")
        with pytest.raises(ValueError):
            security.decode_purpose_token("garbage", "reset")
        with pytest.raises(ValueError):  # a normal login token must not work as a reset token
            security.decode_purpose_token(security.create_access_token("u1"), "reset")

    def test_fingerprint_changes_with_the_password(self):
        a = security.password_fingerprint(security.get_password_hash("one-password"))
        b = security.password_fingerprint(security.get_password_hash("two-password"))
        assert a != b and len(a) == 16

    def test_a_purpose_token_cannot_be_used_to_log_in(self, monkeypatch):
        user = make_user()
        monkeypatch.setattr(deps.crud_user, "get", AsyncMock(return_value=user))
        tok = security.create_purpose_token(user.id, "password-reset", timedelta(minutes=5))
        with pytest.raises(Exception) as e:
            run(deps.get_current_user(db=MagicMock(), token=tok))
        assert getattr(e.value, "status_code", None) == 401
        assert run(deps.get_current_user_optional(db=MagicMock(), token=tok)) is None
        # while a real access token still works
        assert run(deps.get_current_user(db=MagicMock(), token=security.create_access_token(user.id))) is user

    def test_a_purpose_token_cannot_open_the_notification_socket(self, monkeypatch):
        from app.api.api_v1.endpoints import notifications

        tok = security.create_purpose_token(uuid4(), "password-reset", timedelta(minutes=5))
        assert run(notifications._authenticate_ws_token(tok)) is None


# ----------------------------------------------------------------------------------------------- forgot / reset
class TestForgotPassword:
    @pytest.fixture(autouse=True)
    def stubs(self, monkeypatch):
        self.enqueue = AsyncMock()
        monkeypatch.setattr(auth_mod, "enqueue_email", self.enqueue)

    def test_unknown_address_gets_the_same_answer_and_no_mail(self, client, monkeypatch):
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=None))
        r = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
        assert r.status_code == 200 and r.json() == auth_mod.GENERIC_RESET_REPLY
        self.enqueue.assert_not_awaited()

    def test_inactive_account_gets_no_mail(self, client, monkeypatch):
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=make_user(is_active=False)))
        r = client.post("/api/v1/auth/forgot-password", json={"email": "eve@example.com"})
        assert r.json() == auth_mod.GENERIC_RESET_REPLY
        self.enqueue.assert_not_awaited()

    def test_active_account_gets_a_working_link(self, client, monkeypatch):
        user = make_user()
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=user))
        r = client.post("/api/v1/auth/forgot-password", json={"email": "eve@example.com"})
        assert r.status_code == 200 and r.json() == auth_mod.GENERIC_RESET_REPLY
        kwargs = self.enqueue.await_args.kwargs
        assert kwargs["to"] == user.email and kwargs["template"] == "password_reset" and kwargs["kind"] == "password_reset"
        token = kwargs["link"].split("token=")[1]
        claims = security.decode_purpose_token(token, auth_mod.RESET_PURPOSE)
        assert claims["sub"] == str(user.id) and claims["fp"] == security.password_fingerprint(user.hashed_password)
        assert kwargs["link"].startswith(settings.APP_BASE_URL.rstrip("/"))

    def test_throttled_per_address_and_per_client(self, client, monkeypatch):
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=None))
        codes = [client.post("/api/v1/auth/forgot-password", json={"email": "same@example.com"}).status_code for _ in range(6)]
        assert codes[:5] == [200] * 5 and codes[5] == 429
        # another address from the same client still works until the per-client budget is gone
        assert client.post("/api/v1/auth/forgot-password", json={"email": "other@example.com"}).status_code == 200

    def test_invalid_address_is_a_validation_error(self, client):
        assert client.post("/api/v1/auth/forgot-password", json={"email": "not-an-email"}).status_code == 422


class TestResetPassword:
    NEW = "Brand-new-pass-9"

    def _token(self, user, **kw):
        return security.create_purpose_token(
            user.id, auth_mod.RESET_PURPOSE, timedelta(minutes=30),
            fp=kw.pop("fp", security.password_fingerprint(user.hashed_password)), **kw
        )

    @pytest.fixture
    def setup(self, monkeypatch):
        self.user = make_user()
        monkeypatch.setattr(auth_mod.crud_user, "get", AsyncMock(return_value=self.user))

        async def fake_update(db, db_obj, obj_in):
            db_obj.hashed_password = security.get_password_hash(obj_in["password"])
            return db_obj

        self.update = AsyncMock(side_effect=fake_update)
        monkeypatch.setattr(auth_mod.crud_user, "update", self.update)

    def test_valid_token_changes_the_password_and_verifies_the_address(self, client, setup):
        r = client.post("/api/v1/auth/reset-password", json={"token": self._token(self.user), "new_password": self.NEW})
        assert r.status_code == 200
        self.update.assert_awaited_once()
        assert security.verify_password(self.NEW, self.user.hashed_password)
        assert self.user.email_verified_at is not None

    def test_the_link_is_single_use(self, client, setup):
        token = self._token(self.user)
        assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": self.NEW}).status_code == 200
        again = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Another-pass-77"})
        assert again.status_code == 400
        assert self.update.await_count == 1

    @pytest.mark.parametrize("kind", ["garbage", "expired", "wrong-purpose", "wrong-fingerprint"])
    def test_bad_tokens_are_rejected(self, client, setup, kind):
        if kind == "garbage":
            token = "garbage"
        elif kind == "expired":
            token = security.create_purpose_token(self.user.id, auth_mod.RESET_PURPOSE, timedelta(minutes=-1), fp="x")
        elif kind == "wrong-purpose":
            token = security.create_purpose_token(self.user.id, auth_mod.VERIFY_PURPOSE, timedelta(minutes=5), email="e")
        else:
            token = self._token(self.user, fp="deadbeef")
        r = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": self.NEW})
        assert r.status_code == 400
        self.update.assert_not_awaited()

    def test_weak_password_is_refused_and_the_token_survives(self, client, setup):
        token = self._token(self.user)
        r = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "short"})
        assert r.status_code == 422
        self.update.assert_not_awaited()
        assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": self.NEW}).status_code == 200

    def test_deactivated_account_cannot_reset(self, client, setup):
        self.user.is_active = False
        r = client.post("/api/v1/auth/reset-password", json={"token": self._token(self.user), "new_password": self.NEW})
        assert r.status_code == 400

    def test_unknown_user_in_token(self, client, monkeypatch):
        monkeypatch.setattr(auth_mod.crud_user, "get", AsyncMock(return_value=None))
        token = security.create_purpose_token(uuid4(), auth_mod.RESET_PURPOSE, timedelta(minutes=5), fp="x")
        assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": self.NEW}).status_code == 400


# ----------------------------------------------------------------------------------------------- verification
class TestEmailVerification:
    def test_request_sends_a_link_once_per_unverified_user(self, client, monkeypatch):
        user = make_user()
        app.dependency_overrides[deps.get_current_user] = lambda: user
        enqueue = AsyncMock()
        monkeypatch.setattr(auth_mod, "enqueue_email", enqueue)
        r = client.post("/api/v1/auth/request-email-verification")
        assert r.status_code == 200
        kwargs = enqueue.await_args.kwargs
        claims = security.decode_purpose_token(kwargs["link"].split("token=")[1], auth_mod.VERIFY_PURPOSE)
        assert claims["email"] == user.email

    def test_already_verified_users_are_not_mailed(self, client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = lambda: make_user(email_verified_at=datetime.utcnow())
        enqueue = AsyncMock()
        monkeypatch.setattr(auth_mod, "enqueue_email", enqueue)
        assert client.post("/api/v1/auth/request-email-verification").status_code == 200
        enqueue.assert_not_awaited()

    def test_request_is_throttled(self, client, monkeypatch):
        user = make_user()
        app.dependency_overrides[deps.get_current_user] = lambda: user
        monkeypatch.setattr(auth_mod, "enqueue_email", AsyncMock())
        codes = [client.post("/api/v1/auth/request-email-verification").status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]

    def test_verify_marks_the_address(self, client, monkeypatch):
        user = make_user()
        monkeypatch.setattr(auth_mod.crud_user, "get", AsyncMock(return_value=user))
        tok = security.create_purpose_token(user.id, auth_mod.VERIFY_PURPOSE, timedelta(hours=1), email=user.email)
        assert client.post("/api/v1/auth/verify-email", json={"token": tok}).status_code == 200
        assert user.email_verified_at is not None
        first = user.email_verified_at
        assert client.post("/api/v1/auth/verify-email", json={"token": tok}).status_code == 200   # idempotent
        assert user.email_verified_at == first

    def test_link_for_an_old_address_is_refused(self, client, monkeypatch):
        user = make_user(email="new@example.com")
        monkeypatch.setattr(auth_mod.crud_user, "get", AsyncMock(return_value=user))
        tok = security.create_purpose_token(user.id, auth_mod.VERIFY_PURPOSE, timedelta(hours=1), email="old@example.com")
        assert client.post("/api/v1/auth/verify-email", json={"token": tok}).status_code == 400
        assert user.email_verified_at is None

    def test_reset_token_is_not_a_verification_token(self, client, monkeypatch):
        user = make_user()
        monkeypatch.setattr(auth_mod.crud_user, "get", AsyncMock(return_value=user))
        tok = security.create_purpose_token(user.id, auth_mod.RESET_PURPOSE, timedelta(hours=1), fp="x")
        assert client.post("/api/v1/auth/verify-email", json={"token": tok}).status_code == 400


# ----------------------------------------------------------------------------------------------- mailer
class TestMailer:
    def test_templates_escape_user_text_in_html_but_not_in_text(self):
        subject, text, html = mailer.render_email(
            "assignment", name="<i>Eve</i>", task_title="Fix <script>alert(1)</script> & co", project_name="P&Q", link="http://x/t"
        )
        assert "<script>" in subject and "<script>" in text          # plain text stays literal
        assert "<script>" not in html and "&lt;script&gt;" in html   # HTML is escaped
        assert "&lt;i&gt;Eve&lt;/i&gt;" in html and "P&amp;Q" in html

    def test_subject_is_single_line_and_bounded(self):
        subject, _, _ = mailer.render_email(
            "assignment", name="x", task_title="A\nB" + "z" * 500, project_name=None, link="l"
        )
        assert "\n" not in subject and len(subject) <= 200

    def test_missing_template_variables_fail_loudly(self):
        with pytest.raises(Exception):
            mailer.render_email("password_reset", name="x")  # link/minutes missing: StrictUndefined

    def test_absolute_url(self, monkeypatch):
        monkeypatch.setattr(settings, "APP_BASE_URL", "https://planner.example.com/")
        assert mailer.absolute_url("/reset-password?token=t") == "https://planner.example.com/reset-password?token=t"

    def test_retry_backoff_doubles_and_is_capped(self, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_RETRY_BASE_SECONDS", 60)
        assert [mailer.retry_delay(n).total_seconds() for n in (1, 2, 3, 4)] == [60, 120, 240, 480]
        assert mailer.retry_delay(50).total_seconds() == 12 * 3600

    def test_disabled_email_queues_nothing(self, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_ENABLED", False)
        db = MagicMock()
        assert run(mailer.enqueue_raw(db, to="a@example.com", subject="s", text="t")) is None
        db.add.assert_not_called()

    def test_enqueue_adds_a_pending_row(self, monkeypatch, db):
        monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
        row = run(mailer.enqueue_email(
            db, to="a@example.com", kind="assignment", template="assignment",
            name="A", task_title="T", project_name=None, link="http://x",
        ))
        db.add.assert_called_once()
        assert row.kind == "assignment" and row.to_email == "a@example.com" and "T" in row.subject


class FakeOutboxSession:
    def __init__(self, rows):
        self.rows, self.committed = rows, False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self.rows))

    async def commit(self):
        self.committed = True


class TestDelivery:
    @staticmethod
    def row(**kw):
        base = dict(id=uuid4(), to_email="a@example.com", subject="s", body_text="t", body_html=None,
                    status="pending", attempts=0, last_error=None, sent_at=None, next_attempt_at=datetime.utcnow())
        base.update(kw)
        return SimpleNamespace(**base)

    @pytest.fixture
    def wire(self, monkeypatch):
        def go(rows, send):
            session = FakeOutboxSession(rows)
            monkeypatch.setattr(mailer, "AsyncSessionLocal", lambda: session)
            from app.core import notifications

            monkeypatch.setattr(notifications.email_service, "send_email", send)
            return session
        return go

    def test_success_marks_sent(self, wire):
        r = self.row()
        send = MagicMock()
        s = wire([r], send)
        assert run(mailer.deliver_due()) == 1
        send.assert_called_once_with("a@example.com", "s", "t", None)
        assert r.status == "sent" and r.sent_at and r.attempts == 1 and r.last_error is None and s.committed

    def test_failure_schedules_a_retry_with_backoff(self, wire, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_RETRY_BASE_SECONDS", 60)
        monkeypatch.setattr(settings, "EMAIL_MAX_ATTEMPTS", 6)
        r = self.row()
        wire([r], MagicMock(side_effect=ConnectionRefusedError("mail down")))
        before = datetime.utcnow()
        run(mailer.deliver_due())
        assert r.status == "pending" and r.attempts == 1 and "mail down" in r.last_error
        assert before + timedelta(seconds=55) < r.next_attempt_at < before + timedelta(seconds=70)

    def test_gives_up_after_max_attempts(self, wire, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_MAX_ATTEMPTS", 3)
        r = self.row(attempts=2)
        wire([r], MagicMock(side_effect=OSError("still down")))
        run(mailer.deliver_due())
        assert r.status == "failed" and r.attempts == 3

    def test_one_failing_message_does_not_block_the_rest(self, wire):
        bad, good = self.row(to_email="bad@example.com"), self.row(to_email="good@example.com")

        def send(to, *a):
            if to.startswith("bad"):
                raise OSError("rejected")

        wire([bad, good], send)
        run(mailer.deliver_due())
        assert bad.status == "pending" and good.status == "sent"


# ----------------------------------------------------------------------------------------------- scheduler
class TestScheduler:
    @pytest.mark.parametrize("now,hour,weekday,expected", [
        # Wednesday 2026-10-14 12:00, weekly Monday 08:00 -> Monday 2026-10-12 08:00
        (datetime(2026, 10, 14, 12), 8, 0, datetime(2026, 10, 12, 8)),
        # Monday 07:59 -> still last week's Monday
        (datetime(2026, 10, 12, 7, 59), 8, 0, datetime(2026, 10, 5, 8)),
        # Monday 08:00 exactly -> this Monday
        (datetime(2026, 10, 12, 8, 0), 8, 0, datetime(2026, 10, 12, 8)),
        # daily 07:00: before 07:00 -> yesterday, after -> today
        (datetime(2026, 10, 14, 6, 30), 7, None, datetime(2026, 10, 13, 7)),
        (datetime(2026, 10, 14, 7, 1), 7, None, datetime(2026, 10, 14, 7)),
        # across a month boundary
        (datetime(2026, 11, 1, 3, 0), 7, None, datetime(2026, 10, 31, 7)),
    ])
    def test_latest_slot(self, now, hour, weekday, expected):
        slot = scheduler.latest_slot(now, hour, weekday)
        assert slot == expected and slot <= now

    def test_slot_is_stable_within_the_slot_and_advances_after(self):
        a = scheduler.latest_slot(datetime(2026, 10, 14, 9), 7, None)
        b = scheduler.latest_slot(datetime(2026, 10, 14, 23, 59), 7, None)
        c = scheduler.latest_slot(datetime(2026, 10, 15, 7, 0), 7, None)
        assert a == b and c > a

    def test_jobs_run_only_when_their_slot_is_claimed(self, monkeypatch):
        calls = []

        class Ctx:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *a):
                return False

        async def claim(db, name, slot):
            return name == "deadline_reminders"

        async def fake_run(db):
            calls.append("ran")

        monkeypatch.setattr(scheduler, "AsyncSessionLocal", lambda: Ctx())
        monkeypatch.setattr(scheduler, "claim_slot", claim)
        monkeypatch.setattr(scheduler, "JOBS", tuple(
            scheduler.Job(j.name, j.hour, j.weekday, fake_run) for j in scheduler.JOBS
        ))
        assert run(scheduler.run_due_jobs(datetime(2026, 10, 14, 12))) == ["deadline_reminders"]
        assert calls == ["ran"]

    def test_a_crashing_job_does_not_stop_the_others(self, monkeypatch):
        class Ctx:
            async def __aenter__(self):
                db = MagicMock()
                db.rollback = AsyncMock()
                return db

            async def __aexit__(self, *a):
                return False

        async def boom(db):
            raise RuntimeError("digest exploded")

        ok = AsyncMock()
        monkeypatch.setattr(scheduler, "AsyncSessionLocal", lambda: Ctx())
        monkeypatch.setattr(scheduler, "claim_slot", AsyncMock(return_value=True))
        monkeypatch.setattr(scheduler, "JOBS", (scheduler.Job("a", 8, 0, boom), scheduler.Job("b", 7, None, ok)))
        assert run(scheduler.run_due_jobs(datetime(2026, 10, 14, 12))) == ["b"]


# ----------------------------------------------------------------------------------------------- recipients and preferences
class TestAssignmentMail:
    def test_queues_one_mail_per_assignee_with_a_project_link(self, monkeypatch):
        from app.crud.crud_task import task as crud_task

        u1, u2 = make_user(email="a@example.com"), make_user(email="b@example.com")
        db = MagicMock()
        db.info = {}
        db.commit, db.rollback = AsyncMock(), AsyncMock()
        results = [
            SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [u1, u2])),
            SimpleNamespace(scalar=lambda: "Apollo"),
        ]
        db.execute = AsyncMock(side_effect=results)
        enqueue = AsyncMock()
        monkeypatch.setattr(mailer, "enqueue_email", enqueue)
        run(crud_task._email_assignees(db, uuid4(), [u1.id, u2.id], "Ship it", "/projects/1?task_id=2"))
        assert [c.kwargs["to"] for c in enqueue.await_args_list] == ["a@example.com", "b@example.com"]
        assert all(c.kwargs["task_title"] == "Ship it" and c.kwargs["project_name"] == "Apollo" for c in enqueue.await_args_list)
        assert enqueue.await_args_list[0].kwargs["link"].endswith("/projects/1?task_id=2")
        db.commit.assert_awaited_once()

    def test_the_query_filters_inactive_and_opted_out_users(self):
        from app.crud.crud_task import task as crud_task

        captured = {}

        async def execute(stmt):
            captured.setdefault("sql", str(stmt))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

        db = MagicMock()
        db.info = {}
        db.execute = execute
        run(crud_task._email_assignees(db, None, [uuid4()], "T", "/tasks"))
        assert "is_active" in captured["sql"] and "notify_email_assignments" in captured["sql"]

    def test_an_email_problem_never_breaks_the_assignment(self, monkeypatch):
        from app.crud.crud_task import task as crud_task

        db = MagicMock()
        db.info = {}
        db.rollback = AsyncMock()
        db.execute = AsyncMock(side_effect=RuntimeError("db hiccup"))
        run(crud_task._email_assignees(db, None, [uuid4()], "T", "/tasks"))  # must not raise
        # only the SAVEPOINT may be undone; a session-wide rollback would discard the task change around it
        db.rollback.assert_not_awaited()


class TestDigestHtml:
    def test_user_text_is_escaped(self):
        from app.core.summaries import SummaryGenerator

        gen = SummaryGenerator(MagicMock())
        task = SimpleNamespace(title="<img src=x onerror=alert(1)>", due_date=datetime.utcnow() + timedelta(days=1))
        html = gen.generate_user_weekly_summary_html(make_user(full_name="<b>Eve</b>"), [task])
        assert "<img" not in html and "&lt;img" in html and "<b>Eve</b>" not in html


class TestPreferences:
    @pytest.fixture
    def me(self, client, monkeypatch):
        self.user = make_user()
        app.dependency_overrides[deps.get_current_user] = lambda: self.user
        self.update = AsyncMock(return_value=SimpleNamespace(
            id=self.user.id, email=self.user.email, full_name="Eve", is_active=True, is_superuser=False,
            email_verified_at=None, notify_email_assignments=False, notify_email_digest=True,
        ))
        monkeypatch.setattr(users_mod.crud_user, "update", self.update)
        monkeypatch.setattr(users_mod.crud_user, "get_by_email", AsyncMock(return_value=None))

    def test_preferences_can_be_changed_without_a_password(self, client, me):
        r = client.put("/api/v1/users/me", json={"notify_email_assignments": False})
        assert r.status_code == 200
        sent = self.update.await_args.kwargs["obj_in"].model_dump(exclude_unset=True)
        assert sent == {"notify_email_assignments": False}
        assert r.json()["notify_email_assignments"] is False and "email_verified_at" in r.json()

    def test_changing_the_address_resets_verification(self, client, me):
        r = client.put("/api/v1/users/me", json={"email": "new@example.com", "current_password": "old-password-1"})
        assert r.status_code == 200
        sent = self.update.await_args.kwargs["obj_in"].model_dump(exclude_unset=True)
        assert sent["email"] == "new@example.com" and sent["email_verified_at"] is None


class TestOutboxEndpoint:
    def test_requires_an_administrator(self, client):
        app.dependency_overrides[deps.get_current_user] = lambda: make_user()
        assert client.get("/api/v1/outbox/").status_code == 403
        assert client.post(f"/api/v1/outbox/{uuid4()}/retry").status_code == 403

    def test_anonymous_is_401(self, client):
        assert client.get("/api/v1/outbox/").status_code == 401

    def test_bodies_are_hidden_unless_requested(self, client, db):
        app.dependency_overrides[deps.get_current_user] = lambda: make_user(is_superuser=True)
        row = SimpleNamespace(
            id=uuid4(), kind="password_reset", to_email="a@example.com", subject="s", status="sent", attempts=1,
            next_attempt_at=datetime.utcnow(), last_error=None, created_at=datetime.utcnow(), sent_at=datetime.utcnow(),
            body_text="secret reset link",
        )
        db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [row])))
        hidden = client.get("/api/v1/outbox/").json()
        assert hidden[0]["body_text"] is None and hidden[0]["status"] == "sent"
        shown = client.get("/api/v1/outbox/?include_body=true").json()
        assert shown[0]["body_text"] == "secret reset link"

    def test_filter_values_are_validated(self, client):
        app.dependency_overrides[deps.get_current_user] = lambda: make_user(is_superuser=True)
        assert client.get("/api/v1/outbox/?status=bogus").status_code == 422
        assert client.get("/api/v1/outbox/?limit=1000").status_code == 422


# ----------------------------------------------------------------------------------------------- application lifecycle
class TestLifecycle:
    """Starts the real startup/shutdown handlers (the unit tests above never do, and a name clash in
    on_startup once crash-looped the container)."""

    @pytest.fixture
    def patched(self, monkeypatch):
        import app.db.init_db as init_db
        import app.db.migrate as migrate

        self.events = []

        async def forever(name):
            self.events.append(f"{name} started")
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                self.events.append(f"{name} stopped")
                raise

        monkeypatch.setattr(migrate, "upgrade_database", AsyncMock())
        monkeypatch.setattr(init_db, "seed_users", AsyncMock())
        monkeypatch.setattr(mailer, "run_outbox_worker", lambda: forever("outbox"))
        monkeypatch.setattr(scheduler, "run_scheduler", lambda: forever("scheduler"))

    def test_workers_start_with_the_app_and_stop_with_it(self, patched, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        with TestClient(app) as client:
            assert client.get("/api/health").status_code == 200
            assert len(app.state.background_tasks) == 2
        assert sorted(self.events) == ["outbox started", "outbox stopped", "scheduler started", "scheduler stopped"]

    def test_scheduler_can_be_switched_off_separately(self, patched, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", False)
        with TestClient(app):
            assert [t.get_name() for t in app.state.background_tasks] == ["email-outbox"]

    def test_nothing_runs_when_email_is_disabled(self, patched, monkeypatch):
        monkeypatch.setattr(settings, "EMAIL_ENABLED", False)
        with TestClient(app):
            assert app.state.background_tasks == []
        assert self.events == []
