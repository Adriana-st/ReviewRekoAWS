(() => {

  // 1. Select all your nav links
  const navLinks = [
    { id: 'nav-submit', page: 'submit' },
    { id: 'nav-gallery', page: 'gallery' },
    // { id: 'nav-admin', page: 'admin' }
  ];

  // attach event listeners
  navLinks.forEach(link => {
    const element = document.getElementById(link.id);
    if (element) {
      // ❌ This CALLS showPage right now, at page load, for every nav link
      // element.addEventListener('click', showPage(link.page));
      // ✅ This passes a function that will call showPage when clicked
      element.addEventListener('click', () => showPage(link.page));
    }
  });


  const input = document.getElementById('imageFile');
  if (input) {
    input.addEventListener('change', (e) => previewImage(e.target));
  }


  const submitBtn = document.getElementById('btn-submit-review');

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      // Call your logic
      submitReview();
    });
  }

  const filterSelect = document.getElementById('filter-category');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      // Call your function
      // Expert tip: You can pass the selected value directly if needed

      loadGallery();

    });
  }


  const loadBtn = document.getElementById('btn-load-gallery');

  if (loadBtn) {
    loadBtn.addEventListener('click', loadGallery);
  }

})();




// ── CONFIG ──────────────────────────────────────────────────────────────────
// Replace this with your real API Gateway base URL once deployed
const API_BASE = 'https://ptyne4n0cl.execute-api.eu-west-1.amazonaws.com/prod';
// ────────────────────────────────────────────────────────────────────────────

// Navigation
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
}

// Image preview
function previewImage(input) {  // input is now e.target, a real DOM element
  const img = document.getElementById('preview-img');
  if (input.files && input.files[0]) {
    img.src = URL.createObjectURL(input.files[0]);
    img.style.display = 'block';
  }
}

// ── SUBMIT REVIEW ───────────────────────────────────────────────────────────
async function submitReview() {
  const statusEl = document.getElementById('status-msg');
  statusEl.textContent = '';

  const customerName = document.getElementById('customerName').value.trim();
  const productName = document.getElementById('productName').value.trim();
  const productCategory = document.getElementById('productCategory').value;
  const starRating = document.getElementById('starRating').value;
  const reviewText = document.getElementById('reviewText').value.trim();
  const imageFile = document.getElementById('imageFile').files[0];

  // Basic validation
  if (!customerName || !productName || !productCategory || !reviewText || !imageFile) {
    statusEl.textContent = 'Please fill in all fields and select an image.';
    return;
  }

  statusEl.textContent = 'Step 1/3 — Getting upload URL...';

  try {
    // Generate a unique reviewId once — shared across both steps
    const reviewId = crypto.randomUUID();

    // Step 1: Ask Lambda for a presigned S3 URL
    const urlRes = await fetch(
      `${API_BASE}/upload-url?filename=${encodeURIComponent(imageFile.name)}&contentType=${encodeURIComponent(imageFile.type)}&reviewId=${reviewId}`
    );
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, imageKey } = await urlRes.json();

    // Step 2: PUT the image directly to S3 using the presigned URL
    // Must send the exact same Content-Type that the presigned URL was signed with
    statusEl.textContent = 'Step 2/3 — Uploading image to S3...';
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': imageFile.type },
      body: imageFile,
    });
    if (!uploadRes.ok) throw new Error('Image upload to S3 failed');

    // Step 3: POST review metadata to API Gateway
    statusEl.textContent = 'Step 3/3 — Submitting review...';
    const reviewRes = await fetch(`${API_BASE}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewId,
        customerName,
        productName,
        productCategory,
        starRating: parseInt(starRating),
        reviewText,
        imageKey
      })
    });
    if (!reviewRes.ok) throw new Error('Failed to submit review');

    statusEl.textContent = 'Review submitted! It will appear in the gallery once moderation is complete (usually a few seconds).';
    // Reset form
    document.getElementById('customerName').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('reviewText').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('preview-img').style.display = 'none';

  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

// ── GALLERY ─────────────────────────────────────────────────────────────────
async function loadGallery() {
  const resultsEl = document.getElementById('gallery-results');
  const category = document.getElementById('filter-category').value;

  if (resultsEl) {
    resultsEl.textContent = 'Loading...';
  }
  

  try {
    let url = `${API_BASE}/reviews`;
    // if category is not undefined, null or empty - add it as a URL parameter for lambda to see
    // otherwise default URL
    if (category !== undefined && category !== null && category !== "") {
      url = `${API_BASE}/reviews?category=${encodeURIComponent(category)}`;
    }
    

    // REMEMBER
    // // STRUCTURE OF THE RESPONSE IS:
    // { 
    //     'statusCode': 200,
    //     'headers': {
    //         'Access-Control-Allow-Origin': '*',
    //         'Access-Control-Allow-Headers': '*'
    //     },
    //     
    //     'body': {
    //       'products': items,
    //       'count': len(items),
    //       'message': "No products found" if not items else "",
    //       'timestamp': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z') 
    //       
    //     }
    // }
    

    const res = await fetch(url);
    
    if (!res.ok) throw new Error('Failed to load reviews');

    // parse the outer envelope, then parse the body string
    const body = await res.json();

    // if (!reviews.length) {
    //   resultsEl.textContent = 'No approved reviews found.';
    //   return;
    // }


    //<em style="font-size:12px;color:#888">${escHtml(r.productCategory)}</em><br/>

//     3. Совет по UX на фронтенде
// Вместо просто "Sorry, no products", хорошим тоном считается:

//     Пустой стейт (Empty State): Красивая иконка с надписью "В этой категории пока нет товаров".
//     Сброс фильтров: Кнопка "Посмотреть все категории".
    if (body.count < 1) {
      resultsEl.innerHTML = `This category currently has no products. Do you wanna search for all products?`;
    } else {
      resultsEl.innerHTML = body.products.map(r => `
  <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

    ${r.imageKey ? `
      <img
        src="${escHtml(r.imageKey)}"
        alt="Product photo"
        class="mx-auto object-contain h-48 md:object-cover"
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
    }
    

  } catch (err) {
    resultsEl.textContent = 'Sorry, something went wrong'
    console.log(err);
  }
}

// ── ADMIN ───────────────────────────────────────────────────────────────────
// async function loadAdmin() {
//   const resultsEl = document.getElementById('admin-results');
//   resultsEl.textContent = 'Loading...';

//   try {
//     const res = await fetch(`${API_BASE}/reviews?admin=true`);
//     if (!res.ok) throw new Error('Failed to load records');
//     const records = await res.json();

//     if (!records.length) {
//       resultsEl.textContent = 'No records found.';
//       return;
//     }

//     resultsEl.innerHTML = `
//     <table>
//       <thead>
//         <tr>
//           <th>Name</th>
//           <th>Product</th>
//           <th>Category</th>
//           <th>Rating</th>
//           <th>Status</th>
//           <th>Reason / Flags</th>
//           <th>Timestamp</th>
//         </tr>
//       </thead>
//       <tbody>
//         ${records.map(r => `
//           <tr>
//             <td>${escHtml(r.customerName)}</td>
//             <td>${escHtml(r.productName)}</td>
//             <td>${escHtml(r.productCategory)}</td>
//             <td>${r.starRating}★</td>
//             <td class="${r.status === 'APPROVED' ? 'badge-approved' : 'badge-rejected'}">${r.status}</td>
//             <td>${r.reason !== 'none' ? escHtml(r.reason) : ''}
//                 ${r.moderationFlags && r.moderationFlags.length ? r.moderationFlags.join(', ') : ''}</td>
//             <td style="font-size:12px">${r.timestamp ? r.timestamp.slice(0, 16).replace('T', ' ') : ''}</td>
//           </tr>
//         `).join('')}
//       </tbody>
//     </table>`;

//   } catch (err) {
//     resultsEl.textContent = 'Error: ' + err.message;
//   }
// }

// ── HELPERS ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
