import { createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as pdf from '../src/pdf/index.js'

const violations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  violations.push(`${e.effectiveDirective} ${e.blockedURI}`),
)

const root = createRoot(document.getElementById('root')!)

const harness = {
  pdf,
  pdfjs: () => import('pdfjs-dist'),
  h: createElement,
  mount: (node: ReactNode) => root.render(node),
  violations,
}

declare global {
  interface Window {
    harness: typeof harness
  }
}
window.harness = harness
