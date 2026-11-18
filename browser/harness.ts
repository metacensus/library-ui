import { createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as documents from '../src/pdf/document.js'
import * as pdf from '../src/pdf/index.js'
import * as ink from './ink.js'
import '../src/css/tokens.css'
import '../src/css/styles.css'
import '../src/css/pdf.css'

const violations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  violations.push(`${e.effectiveDirective} ${e.blockedURI}`),
)

const root = createRoot(document.getElementById('root')!)

const harness = {
  pdf,
  documents,
  ink,
  pdfjs: () => import('pdfjs-dist'),
  h: createElement,
  mount: (node: ReactNode) => root.render(node),
  violations,
}

declare global {
  interface Window {
    harness: typeof harness
    /** Callbacks a spec logs. */
    calls: unknown[][]
  }
}
window.harness = harness
