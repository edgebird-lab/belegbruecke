/** Minimale Typen für SaxonJS 2.7 (das Paket bringt keine mit); nur was die Belegbrücke nutzt. */
declare module 'saxon-js' {
  export interface SaxonKnoten {
    getAttribute(name: string): string | null
    textContent: string | null
    nodeType: number
  }

  export interface TransformOptionen {
    stylesheetInternal?: unknown
    stylesheetBaseURI?: string
    sourceNode?: unknown
    sourceText?: string
    destination: 'serialized' | 'document' | 'raw'
    stylesheetParams?: Record<string, unknown>
  }

  export interface TransformErgebnis {
    principalResult: unknown
  }

  export interface XPathOptionen {
    namespaceContext?: Record<string, string>
    resultForm?: 'default' | 'array' | 'iterator' | 'xdm'
    params?: Record<string, unknown>
  }

  interface SaxonJS {
    transform(optionen: TransformOptionen, modus: 'sync'): TransformErgebnis
    getResource(optionen: { text: string; type: 'xml' }): Promise<unknown>
    XPath: {
      evaluate(ausdruck: string, kontext: unknown, optionen?: XPathOptionen): unknown
    }
    getProcessorInfo(): { productVersion: string }
  }

  const saxon: SaxonJS
  export default saxon
}
