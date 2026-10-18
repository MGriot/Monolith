import { useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsGroup } from '@/components/ui/settings-group';
import { selectClass } from '@/components/ui/field';
import { confirmDialog } from '@/lib/confirm';

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const EXPIRY = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Never', days: null },
] as const;

const fmt = (d: string | null) => (d ? new Date(d + (d.endsWith('Z') ? '' : 'Z')).toLocaleDateString() : '—');

function tokenState(t: McpToken): 'active' | 'expired' | 'revoked' {
  if (t.revoked_at) return 'revoked';
  if (t.expires_at && new Date(t.expires_at + 'Z').getTime() < Date.now()) return 'expired';
  return 'active';
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — select the text and copy it manually');
  }
}

/** Personal MCP access tokens: AI assistants connect with one and act as you, with your project roles. */
export function McpTokensGroup() {
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState<string>('90');
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<McpToken[]>('/users/me/mcp-tokens').then((r) => setTokens(r.data)).catch(() => setTokens([]));
  useEffect(() => { load(); }, []);

  const sseUrl = `${window.location.origin}/mcp/sse`;

  const create = async () => {
    setBusy(true);
    try {
      const days = expiry === 'never' ? null : Number(expiry);
      const r = await api.post<McpToken & { token: string }>('/users/me/mcp-tokens', { name: name.trim() || 'MCP client', expires_in_days: days });
      setCreated(r.data.token);
      setName('');
      await load();
      toast.success('Token created — copy it now, it is shown only once');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the token'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (t: McpToken) => {
    if (!(await confirmDialog({ title: `Revoke "${t.name}"?`, description: 'Assistants using it lose access on their next request.', confirmLabel: 'Revoke', tone: 'danger' }))) return;
    try {
      await api.delete(`/users/me/mcp-tokens/${t.id}`);
      await load();
      toast.success('Token revoked');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not revoke the token'));
    }
  };

  const shown = created ?? '<your token>';
  const claudeCode = `claude mcp add --transport sse monolith ${sseUrl} --header "Authorization: Bearer ${shown}"`;
  const desktopJson = JSON.stringify({ mcpServers: { monolith: { command: 'npx', args: ['-y', 'mcp-remote', sseUrl, '--header', `Authorization: Bearer ${shown}`] } } }, null, 2);
  const stdio = `podman exec -i -e MONOLITH_MCP_TOKEN=${shown} monolith_backend python mcp_server.py`;

  return (
    <SettingsGroup>
      <div data-testid="mcp-tokens-card">
        <div className="space-y-3 px-5 py-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">New token</div>
            <p className="text-sm text-muted-foreground">Name it after the assistant or machine that will use it, and pick when it should stop working.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Token name" placeholder="Claude Code on laptop" value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 sm:max-w-xs" maxLength={100} />
            <select aria-label="Expires after" className={selectClass + ' h-9 w-32'} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY.map((o) => <option key={o.label} value={o.days === null ? 'never' : String(o.days)}>{o.label === 'Never' ? 'Never expires' : `Expires in ${o.label}`}</option>)}
            </select>
            <Button type="button" size="sm" className="h-9 gap-1.5" disabled={busy} onClick={create}><KeyRound className="h-3.5 w-3.5" /> Create token</Button>
          </div>
        </div>

        {created && (
          <div className="space-y-2 border-t border-hairline bg-warning-soft/40 px-5 py-4">
            <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly aria-label="New MCP token" value={created} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => copyText(created, 'Token')}><Copy className="h-3.5 w-3.5" /> Copy</Button>
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setCreated(null)}>Done</Button>
            </div>
          </div>
        )}

        {tokens && tokens.length > 0 && (
          <ul className="divide-y divide-hairline border-t border-hairline" aria-label="Your MCP tokens">
            {tokens.map((t) => {
              const state = tokenState(t);
              return (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="truncate font-medium">{t.name} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{t.token_prefix}…</span></div>
                    <div className="text-xs text-muted-foreground">Created {fmt(t.created_at)} · Last used {fmt(t.last_used_at)} · Expires {t.expires_at ? fmt(t.expires_at) : 'never'}</div>
                  </div>
                  {state === 'active' ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => revoke(t)} className="gap-1.5 text-danger hover:bg-danger-soft hover:text-danger"><Trash2 className="h-3.5 w-3.5" /> Revoke</Button>
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-muted-foreground capitalize">{state}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <details className="border-t border-hairline px-5 py-4 text-sm">
          <summary className="cursor-pointer font-medium">Connect an assistant</summary>
          <div className="mt-3 space-y-4">
            {[
              { title: 'Claude Code (SSE)', text: claudeCode },
              { title: 'Claude Desktop (claude_desktop_config.json, via mcp-remote)', text: desktopJson },
              { title: 'Any stdio client, on the server host', text: stdio },
            ].map((s) => (
              <div key={s.title} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{s.title}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => copyText(s.text, 'Snippet')}><Copy className="h-3 w-3" /> Copy</Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre rounded-md border border-hairline bg-subtle p-3 font-mono text-xs">{s.text}</pre>
              </div>
            ))}
          </div>
        </details>
      </div>
    </SettingsGroup>
  );
}
