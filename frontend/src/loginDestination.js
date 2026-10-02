export function safeDestination(value, origin = window.location.origin) {
  if(!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/';
  try {
    const parsed=new URL(value,origin);
    if(parsed.origin!==origin || parsed.pathname.includes('%'))return '/';
    if(parsed.pathname==='/' || /^\/(wianews|wiacoding)(\/|$)/.test(parsed.pathname))return parsed.pathname+parsed.search+parsed.hash;
  } catch {}
  return '/';
}
