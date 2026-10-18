import policyText from '../../../content/ridgeline-policy.md?raw'

// TODO(A): render as proper HTML headings/paragraphs, add one hidden
// prompt-injection line to test the extension's sanitizing.
// The extension reads only the section marked data-backpocket="policy".
export default function PolicyPage() {
  return (
    <section id="store-policy" data-backpocket="policy">
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{policyText}</pre>
    </section>
  )
}
