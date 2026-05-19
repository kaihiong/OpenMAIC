'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const DESCRIPTION =
  'OpenMAIC turns any topic or document into a rich, interactive classroom experience. Powered by multi-agent AI, it generates slides, quizzes, interactive simulations, and project-based learning — all delivered by AI teachers and classmates who lecture, draw on a whiteboard, and engage in real-time discussion with you.';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: 'One-Click Lessons',
    desc: 'Describe a topic or attach materials — the AI builds a full lesson in minutes.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Multi-Agent Classroom',
    desc: 'AI teachers and peers lecture, discuss, and interact with you in real time.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Rich Scene Types',
    desc: 'Slides, quizzes, interactive HTML simulations, and project-based learning.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
    title: 'Institutional Access',
    desc: "Powered by NIE's AI infrastructure — secure, institutional, no subscriptions needed.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [visibleFeatures, setVisibleFeatures] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamedRef = useRef('');

  useEffect(() => {
    const t1 = setTimeout(() => setLoaded(true), 300);
    const t2 = setTimeout(() => setTitleVisible(true), 500);
    const t3 = setTimeout(() => {
      let i = 0;
      const tick = () => {
        if (i < DESCRIPTION.length) {
          streamedRef.current += DESCRIPTION[i];
          setStreamed(streamedRef.current);
          i++;
          setTimeout(tick, 16);
        } else {
          let fi = 1;
          const revealNext = () => {
            setVisibleFeatures(fi);
            fi++;
            if (fi <= FEATURES.length) setTimeout(revealNext, 300);
          };
          setTimeout(revealNext, 200);
        }
      };
      tick();
    }, 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: username, pd: password }),
      });
      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error ?? 'Login failed. Please check your credentials.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.card, ...(loaded ? styles.cardLoaded : {}) }}>
        {/* Left panel */}
        <div style={styles.left}>
          <h2 style={{ ...styles.welcomeTitle, ...(titleVisible ? styles.slideIn : {}) }}>
            Welcome to the OpenMAIC
          </h2>
          <p style={styles.desc}>
            {streamed}
            {streamed.length > 0 && streamed.length < DESCRIPTION.length && (
              <span style={styles.cursor}>|</span>
            )}
          </p>
          <div style={styles.features}>
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  ...styles.feature,
                  ...(visibleFeatures > i ? styles.featureVisible : {}),
                }}
              >
                <div style={styles.featureIcon}>{f.icon}</div>
                <span style={styles.featureTitle}>{f.title}</span>
                <span style={styles.featureDesc}>{f.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={styles.right}>
          <div style={{ ...styles.logoWrap, ...(loaded ? styles.fadeIn : {}) }}>
            <Image src="/nie-logo.svg" alt="NIE Logo" width={280} height={80} style={{ height: 'auto' }} priority />
          </div>
          <h1 style={{ ...styles.formTitle, ...(loaded ? styles.fadeIn : {}) }}>
            <span style={styles.formTitleMain}>OpenMAIC</span>
            <br />
            <span style={styles.formTitleSub}>Login</span>
          </h1>

          <form onSubmit={handleLogin} style={styles.form}>
            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={styles.formGroup}>
              <label style={styles.label}>Username</label>
              <div style={styles.inputWrap}>
                <svg style={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  style={styles.input}
                  autoComplete="username"
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.inputWrap}>
                <svg style={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={styles.input}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ ...styles.btn, ...(loading ? styles.btnLoading : {}) }}>
              {loading ? <span style={styles.spinner} /> : <>Login <ArrowIcon /></>}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes gradientAnim {
          0%   { background-position: 0% 0%; }
          25%  { background-position: 100% 50%; }
          50%  { background-position: 50% 100%; }
          75%  { background-position: 0% 50%; }
          100% { background-position: 0% 0%; }
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:translateX(0)} }
      `}</style>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    fontFamily: 'var(--font-sans), Inter, sans-serif',
    padding: '2rem',
    boxSizing: 'border-box',
  },
  card: {
    display: 'flex',
    width: '85%',
    maxWidth: 1100,
    minHeight: 560,
    backgroundColor: 'white',
    borderRadius: 16,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    opacity: 0,
    transform: 'scale(0.95)',
    transition: 'all 0.5s cubic-bezier(0.165,0.84,0.44,1)',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  cardLoaded: { opacity: 1, transform: 'scale(1)' },
  left: {
    flex: 1.5,
    background: 'linear-gradient(130deg, #3b82f6 0%, #8b5cf6 50%, #6366f1 100%)',
    backgroundSize: '300% 300%',
    animation: 'gradientAnim 40s ease infinite',
    color: 'white',
    padding: '2.5rem',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: '1.8rem',
    fontWeight: 700,
    marginBottom: '1rem',
    letterSpacing: '-0.025em',
    opacity: 0,
    transform: 'translateX(-30px)',
    transition: 'all 0.6s cubic-bezier(0.165,0.84,0.44,1)',
  },
  slideIn: { opacity: 1, transform: 'translateX(0)' },
  desc: {
    fontSize: '0.88rem',
    lineHeight: 1.65,
    opacity: 0.9,
    marginBottom: '1.5rem',
    whiteSpace: 'pre-wrap',
  },
  cursor: { display: 'inline-block', animation: 'blink 0.7s step-end infinite' },
  features: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.9rem',
  },
  feature: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    background: 'rgba(255,255,255,0.12)',
    padding: '1rem',
    borderRadius: 12,
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.35)',
    opacity: 0,
    transform: 'translateY(12px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
  },
  featureVisible: { opacity: 1, transform: 'translateY(0)' },
  featureIcon: { width: 26, height: 26, marginBottom: 2 },
  featureTitle: { fontWeight: 600, fontSize: '0.78rem' },
  featureDesc: { fontSize: '0.72rem', lineHeight: 1.5, opacity: 0.9 },
  right: {
    flex: 1,
    padding: '2.5rem',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
    opacity: 0,
    transition: 'opacity 0.5s ease 0.1s',
  },
  fadeIn: { opacity: 1 },
  formTitle: {
    fontSize: '1.8rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
    textAlign: 'center',
    letterSpacing: '-0.025em',
    lineHeight: 1.2,
    opacity: 0,
    transition: 'opacity 0.5s ease 0.2s',
  },
  formTitleMain: { color: '#3182ce' },
  formTitleSub: { display: 'block', fontSize: '1.4rem', fontWeight: 600, color: '#4a5568', marginTop: 4 },
  form: { width: '100%' },
  errorBox: {
    color: '#e53e3e',
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: 6,
    padding: '0.7em 1em',
    fontSize: '0.9em',
    fontWeight: 500,
    marginBottom: '1rem',
    textAlign: 'center',
  },
  formGroup: { marginBottom: '1.4rem' },
  label: { display: 'block', marginBottom: 4, fontWeight: 500, color: '#4a5568', fontSize: '0.85rem' },
  inputWrap: { position: 'relative' },
  inputIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 16,
    height: 16,
    color: '#a0aec0',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2.2rem',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.9rem',
    backgroundColor: '#f7fafc',
    color: '#2d3748',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  btn: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#3182ce',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    transition: 'background-color 0.2s, transform 0.2s',
    marginTop: '0.5rem',
  },
  btnLoading: { backgroundColor: '#2c5282', cursor: 'wait' },
  spinner: {
    display: 'inline-block',
    width: 20,
    height: 20,
    border: '2px solid rgba(255,255,255,0.3)',
    borderRadius: '50%',
    borderTopColor: '#fff',
    animation: 'spin 0.8s linear infinite',
  },
};
