/**
 * Admin Pagination Component
 * Handles click events for the admin pagination partial
 */
(function () {
  'use strict';

  function initPagination() {
    const paginationNavs = document.querySelectorAll('.admin-pagination');
    
    paginationNavs.forEach(function (nav) {
      const baseUrl = nav.dataset.baseUrl;
      if (!baseUrl) return;

      // Handle page number buttons
      nav.querySelectorAll('.admin-pagination-number').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const page = this.dataset.page;
          if (page) {
            window.location.href = baseUrl + '&page=' + page;
          }
        });
      });

      // Handle prev button
      const prevBtn = nav.querySelector('.admin-pagination-prev');
      if (prevBtn && !prevBtn.disabled) {
        prevBtn.addEventListener('click', function () {
          const currentPage = parseInt(nav.dataset.current, 10) || 1;
          if (currentPage > 1) {
            window.location.href = baseUrl + '&page=' + (currentPage - 1);
          }
        });
      }

      // Handle next button
      const nextBtn = nav.querySelector('.admin-pagination-next');
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.addEventListener('click', function () {
          const currentPage = parseInt(nav.dataset.current, 10) || 1;
          const totalPages = parseInt(nav.dataset.total, 10) || 1;
          if (currentPage < totalPages) {
            window.location.href = baseUrl + '&page=' + (currentPage + 1);
          }
        });
      }

      // Handle page size change
      const pageSizeSelect = nav.querySelector('.admin-pagination-pagesize-select');
      if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function () {
          const newPageSize = this.value;
          // Remove existing pageSize param and add new one
          let url = baseUrl.replace(/&?pageSize=\d+/, '');
          url = url.replace(/&?page=\d+/, ''); // Reset to page 1 when changing page size
          window.location.href = url + '&pageSize=' + newPageSize + '&page=1';
        });
      }

      // Handle jump to page
      const jumpInput = nav.querySelector('.admin-pagination-jump-input');
      const jumpBtn = nav.querySelector('.admin-pagination-jump-btn');
      
      if (jumpBtn && jumpInput) {
        jumpBtn.addEventListener('click', function () {
          const page = parseInt(jumpInput.value, 10);
          const totalPages = parseInt(nav.dataset.total, 10) || 1;
          if (page >= 1 && page <= totalPages) {
            window.location.href = baseUrl + '&page=' + page;
          }
        });

        jumpInput.addEventListener('keypress', function (e) {
          if (e.key === 'Enter') {
            jumpBtn.click();
          }
        });
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPagination);
  } else {
    initPagination();
  }
})();
