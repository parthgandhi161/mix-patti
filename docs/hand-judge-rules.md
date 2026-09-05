# Hand Judge rules

Plain-English writeup of the rules implemented in `src/lib/judge/`. This
is the reference for updating the House Rules sheet later - it is not
wired into the app itself (no UI reads this engine yet).

Scope: exactly two hands are compared at a time, each exactly 3 cards
(any variation that deals 4 or 5 cards has already had its discard or
donation resolved before the hands reach the judge). Every variation in
`src/data/variations.json` gets a judge config except **Ek Se Badhkar
Ek**, which is a single-card betting race with no hand comparison.

## Base ranking

Trail > Pure Sequence > Sequence > Colour > Pair > High Card.

## Within-category tiebreaks

| Category | Compare in this order |
|---|---|
| Trail | Rank |
| Pure Sequence | Top card of the run, then suit |
| Sequence | Top card of the run |
| Colour | Highest card, then 2nd, then 3rd, then suit |
| Pair | Pair rank, then kicker, then the higher of the pair's two suits |
| High Card | Highest, then 2nd, then 3rd, then suit (cascading position by position if an earlier suit ties) |

**Sequence has no suit step here on purpose.** A universal fallback (see
"Fewer jokers, then natural cards" below) runs after this table for
every category, even two fully-natural hands with no jokers in play at
all - that's what supplies Sequence's missing suit comparison. The other
categories' own suit steps compare the *declared* suit (which can be a
joker's assigned suit); the fallback afterwards only ever looks at
*natural* cards.

## Sequence order

There are exactly 12 possible 3-card runs. Highest to lowest:

A-K-Q, A-2-3, K-Q-J, Q-J-10, J-10-9, 10-9-8, 9-8-7, 8-7-6, 7-6-5, 6-5-4,
5-4-3, 4-3-2.

A-2-3 is always a valid run, ranked 2nd highest overall - just below
A-K-Q, above every plain run.

## House suit order

**Spades > Diamonds > Clubs > Hearts.** Deliberately non-standard - it's
the house's own order, used everywhere a suit tiebreak is needed.

## Jokers

A joker takes on both a rank AND a suit - whichever combination best
completes the hand (so with 7s wild, 5♠ 6♠ 7♥ is a legal pure sequence,
the 7♥ reading as 7♠). Assignment is always automatic and optimal: for
each hand independently, the engine finds the reading that maximises,
in order:

1. Hand value (the base ranking plus its tiebreaks, above)
2. Fewest jokers used

A card that's eligible to be a joker but ends up declared as its own
real identity costs 0 jokers - it was never actually "used". That's why,
with 7s wild, 7♠7♥7♦ declares Trail of Aces (using all 3 as jokers)
rather than a natural Trail of 7s: Aces simply outvalue 7s, regardless
of joker cost.

### Fewer jokers, then natural cards

If two hands are otherwise tied on value, the one using fewer jokers
wins - a count ladder, not a natural-vs-joker flag:

```
A♠ A♥ A♦  (0 jokers)  beats
A♠ A♥ 7♦  (1 joker)   beats
A♣ 7♠ 7♥  (2 jokers)  beats
7♠ 7♥ 7♦  (3 jokers)
```

This applies to every category, not just trails.

If joker count is also tied, compare the natural (non-joker) cards
only - **rank first, suit only as a final tiebreak**: sort each hand's
natural cards by rank descending and compare position by position; if
every position ties on rank too, compare those same positions by suit.
Jokers are excluded entirely (treated as suitless) - if both hands are
made entirely of jokers, it's a genuine tie.

Jokers may duplicate cards already in play (or even a hand's own real
cards) - deck exhaustion is never tracked, and since jokers are suitless
for tiebreak purposes this never affects a result.

### Joker sources

| Source | Used by | Behaviour |
|---|---|---|
| Fixed ranks | AK47 | A fixed set of ranks (A, K, 4, 7) is always wild |
| Flipped rank | Khula Joker, Badalta Joker | One shared rank (whatever was flipped, or the final flip for Badalta Joker) is wild for both hands |
| Flipped rank + neighbours | Padosi | The flipped rank plus the ranks directly above and below - Ace wraps, so a flipped Ace makes K, A, 2 wild |
| Flipped colour | Laal Kaali | Every card of the flipped card's colour is wild |
| Personal lowest | Chhota Joker | Each hand's own lowest rank (and any other card of that rank in the same hand) is wild for that hand only |
| Personal called rank | Tukka | Each hand calls its own rank in advance; wild for that hand only |
| Conditional pair | Jodi Joker | A natural pair in a hand makes its third card wild for that hand only; no pair, no joker |
| Donated rank | Joker Lelo Joker | Each hand donates one rank, which is wild for the *other* hand only; if both hands donate the same rank, it's wild for neither |
| Multi rank | Haath Ka Kachra | Three ranks are wild for both hands at once |
| Table rank + personal secret | Boli Wale Joker | One rank is wild for both hands; the bidder (hand 1, by this engine's convention) additionally nominates one of their own three cards as a private extra joker |

Joker Lelo Joker doesn't exist as a variation in `variations.json` yet -
the `donatedRank` source above is built and tested, just not attached to
anything today.

## Non-joker special modes

- **Muflis** - invert the *entire* comparison: category order, every
  within-category rank comparison, and the suit ladder. No special
  cases: compute the standard comparison, then flip it. A-2-3 becomes
  the *worst* sequence in Muflis, which is good for you.
- **999 / Char Sau Bees ("420")** - Ace = 1, 2 through 10 at face value
  (including 10 itself, not folded into 0), J/Q/K = 0. Arrange a hand's
  3 values freely into the closest possible number to the target (over
  or under). An exact distance tie is a **declared tie** - nobody wins.
- **Jodi Bijodi** - the dealer declares odd or even; only qualifying
  cards count (odd: A, 3, 5, 7, 9, J, K by the house's own convention -
  even: 2, 4, 6, 8, 10, Q). A hand can end up with 3, 2, 1, or 0 live
  cards.
- **Murda Patta** - one rank goes dead for both hands; those cards
  become blank slots, unable to form a pair, sequence, or trail.
- **Sabka Hissa** - one shared card joins the table; each hand plays its
  best 3 of its own 3 plus that shared card.
- **Bhoot Wale Patte** - two ranks are cursed. Any hand holding either
  cursed rank is disqualified outright, regardless of strength. If only
  one hand is cursed, the clean hand wins automatically. If both are
  cursed, there's no winner and the pot rolls over.
- **Beat the B*tch** - hand 1 is the player, hand 2 is the side hand. A
  tie favours hand 2 (the side hand) - a genuine tie is treated the same
  as the side hand winning outright: nobody takes the pot, it rolls over.
- **Do Raja** - reports both a best-hand result (standard ranking) and a
  worst-hand result (Muflis ranking), on the same two hands.

## Short hands (Jodi Bijodi, Murda Patta)

A hand can be reduced to fewer than 3 live cards. One rule handles both:

- A category needing 3 cards (Trail, Pure Sequence, Sequence, Colour)
  simply cannot form with fewer than 3 live cards.
- Otherwise, compare category first, then card by card; a missing slot
  ranks below any real card.
- Zero live cards means that hand is out entirely. If both hands are
  out, there's no winner.

## Variations needing no special handling

Teen Patti, Gol Chakkar, Fast Fatka, Nikal Fenk, Kismat Ka Jugad, Ek
Aankh Khuli, and Parda Faash all resolve to the plain standard ranking
above - none of their twists change how a hand is judged, only how it's
formed or revealed before the judge ever sees it.
