/**
 * Join Us Page JavaScript
 */
(function() {
  'use strict';

  const form = document.getElementById('joinUsForm');
  const fileInput = document.getElementById('qualificationFiles');
  const fileContainer = document.getElementById('fileUploadContainer');
  const submitBtn = form?.querySelector('.join-us-form__submit');
  const submitText = submitBtn?.querySelector('.join-us-form__submit-text');
  const submitLoading = submitBtn?.querySelector('.join-us-form__submit-loading');
  const successMessage = document.getElementById('successMessage');

  // File upload handling
  let uploadedFiles = [];

  if (fileInput && fileContainer) {
    fileInput.addEventListener('change', function(e) {
      const files = Array.from(e.target.files);

      files.forEach(file => {
        // Check file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
          showToast('File too large: ' + file.name, 'error');
          return;
        }

        // Check if file already exists
        if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
          return;
        }

        uploadedFiles.push(file);
        addFilePreview(file);
      });

      // Reset input to allow selecting same file again
      fileInput.value = '';
    });
  }

  function addFilePreview(file) {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'join-us-form__file-preview';
    previewDiv.dataset.filename = file.name;

    const isImage = file.type.startsWith('image/');

    if (isImage) {
      const reader = new FileReader();
      reader.onload = function(e) {
        previewDiv.innerHTML = `
          <img src="${e.target.result}" alt="${escapeHtml(file.name)}">
          <button type="button" class="join-us-form__file-remove" title="Remove">×</button>
        `;
        bindRemoveButton(previewDiv);
      };
      reader.readAsDataURL(file);
    } else {
      // For non-image files, show a document icon
      previewDiv.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <button type="button" class="join-us-form__file-remove" title="Remove">×</button>
      `;
      bindRemoveButton(previewDiv);
    }

    // Insert before the add button
    const addButton = fileContainer.querySelector('.join-us-form__file-add');
    fileContainer.insertBefore(previewDiv, addButton);
  }

  function bindRemoveButton(previewDiv) {
    const removeBtn = previewDiv.querySelector('.join-us-form__file-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const filename = previewDiv.dataset.filename;
        uploadedFiles = uploadedFiles.filter(f => f.name !== filename);
        previewDiv.remove();
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Form submission
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const companyName = form.querySelector('#companyName')?.value?.trim();
      const city = form.querySelector('#city')?.value?.trim();
      const email = form.querySelector('#email')?.value?.trim();
      const phone = form.querySelector('#phone')?.value?.trim();
      const message = form.querySelector('#message')?.value?.trim();

      // Validate all required fields
      if (!companyName) {
        showToast('Please enter your company name', 'error');
        form.querySelector('#companyName')?.focus();
        return;
      }

      if (!city) {
        showToast('Please enter your city', 'error');
        form.querySelector('#city')?.focus();
        return;
      }

      if (!email) {
        showToast('Please enter your email address', 'error');
        form.querySelector('#email')?.focus();
        return;
      }

      if (!isValidEmail(email)) {
        showToast('Please enter a valid email address', 'error');
        form.querySelector('#email')?.focus();
        return;
      }

      if (!phone) {
        showToast('Please enter your phone number', 'error');
        form.querySelector('#phone')?.focus();
        return;
      }

      if (!message) {
        showToast('Please enter your message', 'error');
        form.querySelector('#message')?.focus();
        return;
      }

      // Validate qualification files (required)
      if (uploadedFiles.length === 0) {
        showToast('Please upload at least one qualification file', 'error');
        document.getElementById('qualificationFiles')?.focus();
        return;
      }

      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        if (submitText) submitText.style.display = 'none';
        if (submitLoading) submitLoading.style.display = 'inline-flex';
      }

      try {
        const formData = new FormData(form);

        // Add files to form data
        uploadedFiles.forEach(file => {
          formData.append('qualificationFiles', file);
        });

        const response = await fetch(form.action, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        });

        const data = await response.json();

        if (data.ok) {
          // Show success message
          form.style.display = 'none';
          if (successMessage) {
            successMessage.style.display = 'block';
            successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          showToast(data.message || 'Application submitted successfully!', 'success');

          // Update CSRF token if provided
          if (data.csrfToken) {
            const csrfInput = form.querySelector('input[name="_csrf"]');
            if (csrfInput) csrfInput.value = data.csrfToken;
          }
        } else {
          showToast(data.message || 'Submission failed. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        showToast('Network error. Please check your connection and try again.', 'error');
      } finally {
        // Reset loading state
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitText) submitText.style.display = 'inline';
          if (submitLoading) submitLoading.style.display = 'none';
        }
      }
    });
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Check for success/error query params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success') === '1') {
    if (form) form.style.display = 'none';
    if (successMessage) successMessage.style.display = 'block';
  }
  if (urlParams.get('error') === 'invalid') {
    showToast('Please fill in all required fields correctly.', 'error');
  }

  // Toast notification function
  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    // Fallback toast implementation
    const toast = document.createElement('div');
    toast.className = `g-toast g-toast--${type}`;
    toast.innerHTML = `
      <div class="g-toast__content">
        <span class="g-toast__message">${escapeHtml(message)}</span>
      </div>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('g-toast--visible');
    });

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('g-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
})();
