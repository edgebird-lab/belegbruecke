import type { Darstellung } from './useDarstellung.ts'

export function Darstellungswahl({ wert, aendern }: { wert: Darstellung; aendern: (d: Darstellung) => void }) {
  return (
    <label className="darstellung">
      <span>Darstellung</span>
      <select value={wert} onChange={(e) => aendern(e.target.value as Darstellung)}>
        <option value="system">wie System</option>
        <option value="hell">hell</option>
        <option value="dunkel">dunkel</option>
      </select>
    </label>
  )
}
