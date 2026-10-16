from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Monolith Project Planner"
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 50

    # Bearer key for the /mcp endpoint. Empty = MCP is NOT mounted.
    MCP_API_KEY: str = ""

    # Accounts / auth hardening
    FIRST_SUPERUSER_EMAIL: str = ""
    FIRST_SUPERUSER_PASSWORD: str = ""
    FIRST_SUPERUSER_NAME: str = "Administrator"
    ALLOW_SIGNUP: bool = False          # public self-registration (POST /users/ without an admin token)
    MIN_PASSWORD_LENGTH: int = 8
    LOGIN_MAX_FAILURES: int = 5
    LOGIN_WINDOW_SECONDS: int = 900

    # Browsers allowed to call the API cross-origin (the bundled proxy is same-origin and needs none)
    CORS_ORIGINS: str = ""   # empty -> the local dev origins below

    @property
    def cors_origin_list(self) -> list:
        raw = self.CORS_ORIGINS.strip() or (
            "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173"
        )
        return [o.strip() for o in raw.split(",") if o.strip()]

    # Webhooks may target private/internal addresses only when explicitly enabled
    WEBHOOK_ALLOW_PRIVATE: bool = False

    # SMTP Configuration
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = False
    SMTP_VERIFY_TLS: bool = True
    SMTP_TIMEOUT: int = 10
    APP_BASE_URL: str = "http://localhost:8080"
    EMAILS_FROM_EMAIL: str = "noreply@monolith.local"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
