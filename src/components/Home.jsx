import { CardBack } from './Card'
import './Home.css'

/**
 * Stage 1 - the idle screen. Wordmark, one big face-down card as the
 * tap target, and a thumb-friendly button that does the same thing.
 * Nothing else: no rules, no list.
 */
export function Home({ onMix }) {
  return (
    <div className="stage home">
      <div className="home__middle">
        <header className="home__head">
          <h1 className="home__wordmark">Mix Patti</h1>
          <p className="home__tagline">20 twists on Teen Patti</p>
        </header>

        <button
          type="button"
          className="home__cardBtn"
          onClick={onMix}
          aria-label="Mix a twist"
        >
          <CardBack className="home__card" />
        </button>
        <p className="home__hint">tap to mix</p>
      </div>

      <footer className="home__foot">
        <button type="button" className="btn btn--gold" onClick={onMix}>
          Mix a twist
        </button>
      </footer>
    </div>
  )
}
