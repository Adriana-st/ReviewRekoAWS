What changed and why:

**Image moves to the top** — sits flush above the card content with `h-48 object-cover` so every card is the same height regardless of image dimensions. `overflow-hidden` on the wrapper clips it to the rounded corners cleanly.

**Name + stars in a flex row** — customer name and category on the left, star rating pinned right with `shrink-0` so it never wraps. `tracking-widest uppercase` on the category gives it a label/badge feel without a background.

**AI description gets a subtle separator** — `border-t border-slate-100 pt-3` visually separates the machine-generated text from the human review text without being heavy-handed.

**Labels as pills** — `rounded-full bg-slate-100` per label instead of a single comma-joined string, which makes them scannable at a glance.

```js
resultsEl.innerHTML = reviews.map(r => `
  <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

    ${r.imageKey ? `
      <img
        src="${escHtml(r.imageKey)}"
        alt="Product photo"
        class="w-full h-48 object-cover"
      />
    ` : ''}

    <div class="p-5 space-y-3">

      <!-- Name + category -->
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-slate-900">${escHtml(r.customerName)}</p>
          <p class="text-xs text-slate-400 uppercase tracking-widest mt-0.5">${escHtml(r.productCategory)} · ${escHtml(r.productName)}</p>
        </div>
        <span class="text-amber-400 text-base shrink-0">${'★'.repeat(r.starRating)}${'☆'.repeat(5 - r.starRating)}</span>
      </div>

      <!-- Review text -->
      <p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.reviewText)}</p>

      <!-- AI description -->
      ${r.aiDescription ? `
        <p class="text-xs text-slate-400 italic border-t border-slate-100 pt-3">
          ${escHtml(r.aiDescription)}
        </p>
      ` : ''}

      <!-- Label pills -->
      ${r.labelsDetected && r.labelsDetected.length ? `
        <div class="flex flex-wrap gap-1 pt-1">
          ${r.labelsDetected.map(l => `
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              ${escHtml(l)}
            </span>
          `).join('')}
        </div>
      ` : ''}

    </div>
  </div>
`).join('');
```

