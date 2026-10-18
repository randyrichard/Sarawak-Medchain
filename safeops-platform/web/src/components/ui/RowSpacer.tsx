/**
 * Pushes what follows it to the right end of a wrapping row, while it shares that row.
 *
 * An auto left margin pushed it right on a line of its own as well. On a phone the toolbar
 * wraps, and Board / List / Calendar / Analytics, New Session, or Verify and Export sat alone
 * at the right edge, away from where every other line starts. This takes the free space
 * instead. It always fits on the line before - its negative margin cancels the row's gap, so
 * it adds no width - and whatever follows it wraps to the start of the next line, on the left.
 *
 *     <div className="flex flex-wrap gap-2">
 *       <Search /> <Filters />
 *       <RowSpacer />
 *       <Tabs />
 *     </div>
 */
export function RowSpacer() {
  return <span aria-hidden className="-ml-3 min-w-0 flex-1" />
}
