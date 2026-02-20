import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MarkdownTextProps = {
  content: string
  compact?: boolean
}

export default function MarkdownText({ content, compact = false }: MarkdownTextProps) {
  const base = compact
    ? 'space-y-1 text-sm leading-relaxed text-stone-700 break-words'
    : 'space-y-2 text-base leading-relaxed text-stone-800 break-words'

  return (
    <div className={base}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold text-stone-900">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-stone-900">{children}</h2>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          code: ({ children }) => (
            <code className="rounded bg-stone-200/70 px-1 py-0.5 text-[0.9em] text-stone-800">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-stone-900/90 p-3 text-xs text-stone-100">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline decoration-stone-400">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
