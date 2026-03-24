import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Constants ─────────────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  {
    icon: '🚛',
    text: '8 pallets of pharmaceutical products, temperature-controlled at 5°C, from Basel to Rotterdam, within 3 days',
    label: 'Logistics'
  },
  {
    icon: '💼',
    text: "We're a CHF 120M industrial company based in Switzerland and want to expand into the US market",
    label: 'Consulting'
  },
  {
    icon: '☁️',
    text: 'We need managed hosting for our web app, 10 containers on GCP, with 24/7 monitoring',
    label: 'IT Infrastructure'
  }
];

// ── Markdown components ───────────────────────────────────────────────────────

const MD_COMPONENTS = {
  pre({ children }) {
    return <pre className="code-block">{children}</pre>;
  },
  code({ children, className, ...props }) {
    const isBlock = Boolean(className);
    return isBlock ? (
      <code className={className} {...props}>{children}</code>
    ) : (
      <code className="code-inline" {...props}>{children}</code>
    );
  }
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Message({ role, content, isStreaming }) {
  return (
    <div className={`message message--${role}`}>
      <div className="message__bubble">
        {role === 'assistant' ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {content}
          </ReactMarkdown>
        ) : (
          <p>{content}</p>
        )}
        {isStreaming && <span className="streaming-cursor" aria-hidden="true">▊</span>}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message message--assistant">
      <div className="message__bubble">
        <div className="typing-indicator" aria-label="Thinking…">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="error-banner" role="alert">
      {message}
    </div>
  );
}

function InfoModal({ onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">✕</button>
        <h2 id="modal-title">What is this?</h2>
        <p>
          This agent demonstrates the <strong>Open Service Protocol (OSP)</strong> — an open standard
          that enables AI agents to discover, evaluate, and order services.
        </p>
        <p>
          The agent runs on Meta's <strong>Llama 4 Scout</strong> via Cloudflare Workers AI.
          OSP is model-agnostic — it works because the format is structured,
          not because any particular AI model is used.
        </p>
        <p>
          The provider data comes from real <code>osp.md</code> files — the same format
          any business can publish on its website.
        </p>
        <div className="modal__links">
          <a href="https://openserviceprotocol.org" target="_blank" rel="noopener noreferrer">
            → Learn more: openserviceprotocol.org
          </a>
          <a href="https://github.com/openserviceprotocol/osp" target="_blank" rel="noopener noreferrer">
            → Create your own osp.md: GitHub Repository
          </a>
          <a href="https://distll.io" target="_blank" rel="noopener noreferrer">
            → Professional support: distll.io
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', content: trimmed };
    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history })
      });

      if (res.status === 429) {
        const data = await res.json();
        setError(data.message ?? 'Usage limit reached. Try again later.');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // ── Streaming response ──────────────────────────────────────────────
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                setError(parsed.error);
              } else if (parsed.token) {
                full += parsed.token;
                setStreamingContent(full);
              }
            } catch {
              // skip malformed chunk
            }
          }
        }

        setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
        setStreamingContent('');
      } else {
        // ── JSON response (fallback) ────────────────────────────────────────
        const data = await res.json();
        if (data.response) {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
        } else if (data.error) {
          setError(data.error);
        }
      }
    } catch (err) {
      setError('Connection error. Please check your network and try again.');
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      inputRef.current?.focus();
    }
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const showStarters = messages.length === 0 && !isLoading;

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header__left">
          <span className="header__badge">OSP</span>
          <div>
            <h1 className="header__title">Demo Agent</h1>
            <p className="header__subtitle">Powered by Llama 4 Scout on Cloudflare Workers AI</p>
          </div>
        </div>
        <button
          className="header__info-btn"
          onClick={() => setShowInfo(true)}
          aria-label="About this demo"
          title="What is this?"
        >
          ?
        </button>
      </header>

      {/* ── Chat ───────────────────────────────────────────────────────────── */}
      <main className="chat">
        {showStarters && (
          <div className="welcome">
            <p className="welcome__lead">
              I compare service providers using their OSP manifests —<br />
              structured, transparent, and in seconds.
            </p>
            <p className="welcome__sub">
              9 providers across 3 industries loaded. Tell me what you need:
            </p>
            <div className="starters">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  className="starter"
                  onClick={() => sendMessage(p.text)}
                >
                  <span className="starter__icon">{p.icon}</span>
                  <span className="starter__body">
                    <span className="starter__label">{p.label}</span>
                    <span className="starter__text">{p.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="messages">
          {messages.map((msg, i) => (
            <Message key={i} role={msg.role} content={msg.content} />
          ))}

          {streamingContent && (
            <Message role="assistant" content={streamingContent} isStreaming />
          )}

          {isLoading && !streamingContent && <TypingIndicator />}

          {error && <ErrorBanner message={error} />}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="input-area">
        <form className="input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="input-field"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Describe what you need…"
            disabled={isLoading}
            autoFocus
            aria-label="Message"
          />
          <button
            className="send-btn"
            type="submit"
            disabled={isLoading || !inputValue.trim()}
          >
            Send
          </button>
        </form>
        <footer className="footer">
          <a href="https://openserviceprotocol.org" target="_blank" rel="noopener noreferrer">
            openserviceprotocol.org
          </a>
          <span className="footer__dot">·</span>
          <span>Model-agnostic by design</span>
        </footer>
      </div>

      {/* ── Info modal ─────────────────────────────────────────────────────── */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
