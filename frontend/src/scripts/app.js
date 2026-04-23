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
            loadGallery();
            
            // Expert tip: You can pass the selected value directly if needed
            // loadGallery(filterSelect.value);
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

      statusEl.textContent = 'Step 1/2 — Uploading image...';

      try {
        // Generate a unique reviewId once for this submission
        const reviewId = crypto.randomUUID();

        // Step 1: Send image directly to Lambda via API Gateway
        const uploadRes = await fetch(`${API_BASE}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': imageFile.type, 'x-review-id': reviewId },
          body: imageFile
        });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const { imageKey } = await uploadRes.json();

        // Step 2: POST review metadata to API Gateway
        statusEl.textContent = 'Step 2/2 — Submitting review...';
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
      resultsEl.textContent = 'Loading...';

      try {
        const url = category
          ? `${API_BASE}/reviews?category=${encodeURIComponent(category)}`
          : `${API_BASE}/reviews`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load reviews');
        const reviews = await res.json();

        if (!reviews.length) {
          resultsEl.textContent = 'No approved reviews found.';
          return;
        }

        resultsEl.innerHTML = reviews.map(r => `
        <div class="review-card">
          <span class="stars">${'★'.repeat(r.starRating)}${'☆'.repeat(5 - r.starRating)}</span>
          &nbsp;— ${escHtml(r.customerName)}<br/>
          <em style="font-size:12px;color:#888">${escHtml(r.productCategory)}</em><br/>
          <p style="margin:6px 0">${escHtml(r.reviewText)}</p>
          ${r.aiDescription ? `<p style="font-size:12px;color:#555;font-style:italic">${escHtml(r.aiDescription)}</p>` : ''}
          ${r.imageKey ? `<img src="${escHtml(r.imageKey)}" alt="Product photo"/>` : ''}
          ${r.labelsDetected && r.labelsDetected.length
            ? `<div class="labels">Detected: ${r.labelsDetected.join(', ')}</div>`
            : ''}
        </div>
      `).join('');

      } catch (err) {
        resultsEl.textContent = 'Error: ' + err.message;
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

