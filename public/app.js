(function(){
    'use strict';

    const API_BASE = '/api';

    let currentComicSlug = null;
    let currentComicDetail = null;
    let favorites = JSON.parse(localStorage.getItem('satriad_favorites') || '[]');
    let readingHistory = JSON.parse(localStorage.getItem('satriad_history') || 'null');

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const pages = {
        home: $('#homePage'),
        manga: $('#mangaPage'),
        manhwa: $('#manhwaPage'),
        manhua: $('#manhuaPage'),
        favoritku: $('#favoritkuPage'),
        detail: $('#detailPage'),
        searchResult: $('#searchResultPage')
    };

    function showToast(msg) {
        const toast = $('#toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function updateActiveNav(pageId) {
        $$('.lnb .item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
    }

    function switchPage(pageId) {
        Object.values(pages).forEach(p => p.classList.remove('active'));
        pages[pageId].classList.add('active');
        updateActiveNav(pageId);
        window.scrollTo(0, 0);

        if (pageId === 'manga') loadTypeList('manga', $('#mangaGrid'));
        else if (pageId === 'manhwa') loadTypeList('manhwa', $('#manhwaGrid'));
        else if (pageId === 'manhua') loadTypeList('manhua', $('#manhuaGrid'));
        else if (pageId === 'favoritku') renderFavoriteList();
        else if (pageId === 'home') {
            loadHomeTrending();
            loadHomeCategory('Drama');
            loadNewSeries();
        }
    }

    async function apiCall(action, params = {}) {
        const url = new URL(API_BASE, window.location.origin);
        url.searchParams.set('action', action);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network error');
        return res.json();
    }

    async function performSearch(query, navigateToPage = false) {
        try {
            const data = await apiCall('search', { q: query });
            if (navigateToPage) {
                renderSearchResultPage(query, data);
                switchPage('searchResult');
            } else {
                renderSearchDropdown(data);
            }
        } catch (e) {
            showToast('Gagal mencari');
        }
    }

    function renderSearchDropdown(results) {
        const container = $('#searchResults');
        if (!results || results.length === 0) {
            container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Tidak ditemukan</p>';
            return;
        }
        container.innerHTML = results.map(item => `
            <div class="search-result-item" data-slug="${item.href.split('/').filter(Boolean).pop()}">
                <div style="position:relative;width:50px;height:65px;border-radius:6px;background:#e0e0e0;overflow:hidden;">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : '<svg><rect width="100%" height="100%" fill="#ccc"/></svg>'}
                </div>
                <div><strong>${item.title}</strong><div style="font-size:12px;color:#888;">${item.type} · ${item.genre}</div></div>
            </div>
        `).join('');
        $$('.search-result-item').forEach(el => {
            el.addEventListener('click', () => {
                const slug = el.dataset.slug;
                loadComicDetail(slug);
                $('#searchContainer').classList.remove('active');
            });
        });
    }

    function renderSearchResultPage(query, results) {
        const container = $('#searchResultFullList');
        if (!results || results.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:40px;">Tidak ditemukan</p>';
            return;
        }
        container.innerHTML = results.map(item => `
            <div class="search-result-item" data-slug="${item.href.split('/').filter(Boolean).pop()}">
                <div class="thumb">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" loading="lazy">` : '<svg><rect width="100%" height="100%" fill="#ccc"/></svg>'}
                </div>
                <div class="info">
                    <div class="title">${item.title}</div>
                    <div class="meta">${item.type} · ${item.genre}</div>
                    <div class="meta">${item.last_update || ''}</div>
                </div>
            </div>
        `).join('');
        $$('.search-result-item').forEach(el => {
            el.addEventListener('click', () => {
                const slug = el.dataset.slug;
                loadComicDetail(slug);
            });
        });
    }

    async function loadComicDetail(slug) {
        try {
            showToast('Memuat detail...');
            const data = await apiCall('detail', { slug: slug });
            currentComicSlug = slug;
            currentComicDetail = data;
            renderDetailPage(data);
            switchPage('detail');
        } catch (e) {
            showToast('Gagal memuat detail');
        }
    }

    function renderDetailPage(data) {
        $('#detailTitleHeader').textContent = data.title || 'Tanpa Judul';
        $('#detailGenre').textContent = data.genres?.join(' · ') || '';
        $('#detailDesc').textContent = data.short_description || data.full_synopsis || '';
        $('#detailRating').innerHTML = `★ ${data.metaInfo?.rating || '-'}`;
        $('#detailViews').innerHTML = `👁 ${data.metaInfo?.views || '-'}`;
        $('#episodeCount').textContent = `${data.episodes?.length || 0} Episode`;
        $('#detailPoster').innerHTML = data.thumbnail_url 
            ? `<img src="${data.thumbnail_url}" style="width:100%;height:100%;object-fit:cover;">`
            : '<svg><rect width="100%" height="100%" fill="#ccc"/></svg>';

        const favBtn = $('#detailFavoriteBtn');
        const favText = $('#favoriteBtnText');
        const isFav = favorites.some(f => f.slug === currentComicSlug);
        if (isFav) {
            favBtn.classList.add('active');
            favText.textContent = 'Hapus dari Favorit';
        } else {
            favBtn.classList.remove('active');
            favText.textContent = 'Tambah ke Favorit';
        }

        const epList = $('#episodeList');
        epList.innerHTML = '';
        if (data.episodes) {
            data.episodes.forEach(ep => {
                const div = document.createElement('div');
                div.className = 'episode-item';
                div.dataset.ep = ep.link;
                div.innerHTML = `
                    <div class="episode-thumb"><svg><rect width="100%" height="100%" fill="#ccc"/></svg></div>
                    <div class="episode-info">
                        <div class="episode-num">${ep.title}</div>
                        <div class="episode-date">${ep.release_date || ''}</div>
                    </div>
                `;
                div.addEventListener('click', () => {
                    openReader(ep.link, ep.title);
                });
                epList.appendChild(div);
            });
        }
    }

    async function openReader(chapterUrl, title) {
        $('#readerMode').classList.add('active');
        document.body.style.overflow = 'hidden';
        $('#readerTitle').textContent = title || 'Chapter';
        const content = $('#readerContent');
        content.innerHTML = '<p style="color:#fff;text-align:center;padding:40px;">Memuat halaman...</p>';
        try {
            const data = await apiCall('chapter', { url: chapterUrl });
            if (data.images && data.images.length) {
                content.innerHTML = data.images.map(img => `
                    <div class="reader-page"><img src="${img}" style="width:100%;height:auto;display:block;" loading="lazy"></div>
                `).join('');
            } else {
                content.innerHTML = '<p style="color:#fff;">Gambar tidak tersedia</p>';
            }
            const thumbs = $('#readerThumbnails');
            if (currentComicDetail?.episodes) {
                thumbs.innerHTML = currentComicDetail.episodes.map(ep => {
                    const active = ep.link === chapterUrl ? 'active' : '';
                    return `<div class="reader-thumb-item ${active}" data-url="${ep.link}">
                        <div class="reader-thumb-img"><svg><rect width="100%" height="100%" fill="#444"/></svg></div>
                        <div class="reader-thumb-ep">${ep.title}</div>
                    </div>`;
                }).join('');
                $$('.reader-thumb-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const url = el.dataset.url;
                        openReader(url, el.querySelector('.reader-thumb-ep').textContent);
                    });
                });
            }
            readingHistory = { slug: currentComicSlug, chapterUrl, title: currentComicDetail?.title };
            localStorage.setItem('satriad_history', JSON.stringify(readingHistory));
            updateContinueReading();
        } catch (e) {
            content.innerHTML = '<p style="color:#fff;">Gagal memuat chapter</p>';
        }
    }

    function updateContinueReading() {
        const section = $('#continueReadingSection');
        if (readingHistory) {
            section.style.display = 'block';
            $('#continueTitle').textContent = readingHistory.title || 'Lanjutkan';
            $('#continueEpisode').textContent = 'Lanjutkan membaca';
        } else {
            section.style.display = 'none';
        }
    }

    async function loadHomeTrending() {
        try {
            const data = await apiCall('search', { q: 'one piece' });
            const trendingList = $('#trendingList');
            trendingList.innerHTML = data.slice(0,9).map((item, idx) => `
                <li class="item"><a class="link" data-slug="${item.href.split('/').filter(Boolean).pop()}">
                    <div class="image_wrap">${item.thumbnail?`<img src="${item.thumbnail}">`:'<svg><rect width="100%" height="100%" fill="#ccc"/></svg>'}</div>
                    <div class="ranking_number"><div class="ranking_num ranking_${idx+1}">${idx+1}</div></div>
                    <div class="info_text"><strong class="title">${item.title}</strong><div class="genre">${item.genre}</div></div>
                </a></li>
            `).join('');
            bindHomeLinks();
        } catch(e) {}
    }

    async function loadHomeCategory(genre) {
        try {
            const data = await apiCall('search', { q: genre });
            const grid = $('#categoryGrid');
            grid.innerHTML = data.slice(0,6).map(item => `
                <div class="grid-item" data-slug="${item.href.split('/').filter(Boolean).pop()}">
                    <div class="image_wrap">${item.thumbnail?`<img src="${item.thumbnail}">`:'<svg><rect width="100%" height="100%" fill="#ccc"/></svg>'}</div>
                    <div class="title">${item.title}</div><div class="genre">${item.genre}</div>
                </div>
            `).join('');
            bindGridLinks();
        } catch(e) {}
    }

    async function loadNewSeries() {
        try {
            const data = await apiCall('search', { q: 'terbaru' });
            const list = $('#newSeriesList');
            list.innerHTML = data.slice(0,8).map(item => `
                <li class="item"><div class="image_wrap" data-slug="${item.href.split('/').filter(Boolean).pop()}">
                    ${item.thumbnail?`<img src="${item.thumbnail}">`:'<svg><rect width="100%" height="100%" fill="#ccc"/></svg>'}
                </div></li>
            `).join('');
            $$('.carousel_list .image_wrap').forEach(el => {
                el.addEventListener('click', () => {
                   