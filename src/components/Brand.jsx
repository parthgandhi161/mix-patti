import './Brand.css'
import { version } from '../../package.json'

/** Small permanent footer credit, tucked into the safe-area gutter. */
export function Credit() {
  return (
    <p className="credit">
      made with <span className="credit__heart">♥</span> by Parth Gandhi
      <span className="credit__version">v{version}</span>
    </p>
  )
}
