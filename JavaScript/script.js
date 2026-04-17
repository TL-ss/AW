document.addEventListener('DOMContentLoaded', function() {
    const pages = document.querySelectorAll('.page');
    const dots = document.querySelectorAll('.pagination-dot');
    let currentPage = 0;
    const totalPages = pages.length;
    let isAnimating = false;

    function goToPage(index) {
        if (isAnimating || index === currentPage) return;
        if (index < 0 || index >= totalPages) return;

        isAnimating = true;

        const currentPageEl = pages[currentPage];
        const nextPageEl = pages[index];

        if (currentPage === 4 && index === 5) {
            currentPageEl.classList.add('slide-up');
            currentPageEl.classList.remove('active');
            nextPageEl.classList.add('active');
        } else if (currentPage === 5 && index === 4) {
            currentPageEl.classList.remove('active');
            nextPageEl.classList.remove('slide-up');
            nextPageEl.classList.add('active');
        } else {
            currentPageEl.classList.remove('active');
            nextPageEl.classList.add('active');
        }

        dots[currentPage].classList.remove('active');

        setTimeout(() => {
            isAnimating = false;
        }, 600);

        currentPage = index;
        dots[currentPage].classList.add('active');
    }

    function nextPage() {
        if (currentPage >= totalPages - 1) return;
        goToPage(currentPage + 1);
    }

    function prevPage() {
        if (currentPage <= 0) return;
        goToPage(currentPage - 1);
    }

    let touchStartY = 0;
    let touchEndY = 0;

    window.addEventListener('touchstart', function(e) {
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    window.addEventListener('touchend', function(e) {
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartY - touchEndY;

        if (Math.abs(diff) < swipeThreshold) return;

        if (diff > 0) {
            nextPage();
        } else {
            prevPage();
        }
    }

    let wheelLocked = false;
    window.addEventListener('wheel', function(e) {
        e.preventDefault();

        if (wheelLocked) return;

        wheelLocked = true;
        setTimeout(() => { wheelLocked = false; }, 900);

        if (e.deltaY > 0) {
            nextPage();
        } else {
            prevPage();
        }
    }, { passive: false });

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            goToPage(index);
        });
    });
});