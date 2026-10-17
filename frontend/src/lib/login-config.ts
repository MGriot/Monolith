import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface LoginConfig {
  allow_signup: boolean;
  email_enabled: boolean;
  min_password_length: number;
}

const DEFAULT_CONFIG: LoginConfig = { allow_signup: false, email_enabled: true, min_password_length: 8 };

/** Public sign-up settings; `loaded` is false until the request settles (failure keeps the safe defaults). */
export function useLoginConfig() {
  const [config, setConfig] = useState<LoginConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<LoginConfig>('/auth/config')
      .then((res) => !cancelled && setConfig({ ...DEFAULT_CONFIG, ...res.data }))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loaded };
}
