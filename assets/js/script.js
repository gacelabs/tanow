const API_BASE = "https://iptv-org.github.io/api";

const grid = document.getElementById("channelGrid");
const modal = document.getElementById("playerModal");
const video = document.getElementById("videoPlayer");
const audio = document.getElementById("audioPlayer");
const closeModal = document.getElementById("closeModal");
const searchInput = document.getElementById("searchInput");
const countryFilter = document.getElementById("countryFilter");
const loading = document.getElementById("loading");
const videoError = document.getElementById("videoError");
const channelName = document.getElementById("channelName");

const fullscreenOverlay = document.getElementById("fullscreenOverlay");
const prevNameEl = document.getElementById("prevChannelName");
const currentNameEl = document.getElementById("currentChannelName");
const nextNameEl = document.getElementById("nextChannelName");

const pagination = document.getElementById('pagination');
const pageInfo = document.getElementById('pageInfo');

videoError.style.display = "none";
audio.style.display = "none";

let channels = [];
let streams = [];
let playable = [];
let currentChannelIndex = 0; // tracks the currently playing channel
let filtered = [];

const CHANNELS_PER_PAGE = 30;
let currentPage = 1;
let currentCountryChannels = [];

async function detectUserCountry() {
	try {
		const res = await fetch('https://ipapi.co/json/');
		const data = await res.json();
		return data.country_code; // e.g., "PH"
	} catch (e) {
		console.warn("Could not detect user country:", e);
		return ""; // fallback to all countries
	}
}

async function loadData() {
	document.querySelector('.footer-bottom').textContent = `© ${new Date().getFullYear()} TaNow IPTV. All rights reserved.`;
	try {
		const [channelsRes, streamsRes, countriesRes, logosRes] = await Promise.all([
			fetch(`${API_BASE}/channels.json`),
			fetch(`${API_BASE}/streams.json`),
			fetch(`${API_BASE}/countries.json`),
			fetch(`${API_BASE}/logos.json`)
		]);

		channels = await channelsRes.json();
		streams = await streamsRes.json();
		const countries = await countriesRes.json();
		const logos = await logosRes.json();

		// Map logos by channel id
		const logosMap = {};
		logos.forEach(l => { if (l.url) logosMap[l.channel] = l.url; });

		populateCountries(countries);
		filterPlayableChannels(logosMap);

		// Detect user's country
		const userCountry = await detectUserCountry();
		if (userCountry) {
			countryFilter.value = userCountry; // set dropdown to detected country
			filterUI(); // render channels of detected country
		} else {
			renderChannels(playable); // fallback: show all
		}

	} catch (e) {
		console.error(e);
		loading.innerText = "Failed to load IPTV data.";
	}
}

const nextBtn = document.getElementById("nextChannel");
const prevBtn = document.getElementById("prevChannel");
// 'https://placehold.co/300x150?text=No+Logo'
function renderChannels(list) {
	grid.innerHTML = "";

	list.forEach((c, index) => {
		if (index > 0 && index % 10 === 0) {
			const ad = document.createElement("div");
			ad.className = "ad";
			ad.textContent = "AdSense In-Feed Ad";
			grid.appendChild(ad);
		}

		const card = document.createElement("div");
		card.className = "card";
		const isFav = isFavorite(c.id);
		const logo = c.logo;

		card.innerHTML = `
		<div class="card-inner">
			<div class="card-top">
			<button class="fav-btn ${isFav ? 'active' : ''}" 
					data-fav="${c.id}" data-index="${index}">
				${isFav ? '★' : '☆'}
			</button>
			<img loading="lazy"
				src="${logo}"
				alt="${c.name}"
				onerror="this.src='https://placehold.co/300x150?text=No+Logo'">
			</div>
			<div class="card-bottom">
			<div class="card-title">${c.name}</div>
			<div class="card-meta">${c.country || 'Global'}</div>
			</div>
		</div>
		`;

		card.onclick = () => {
			currentChannelIndex = index; // set current index when clicked
			setTraveseTexts();
			playVideo(c.stream);
		};
		grid.appendChild(card);
	});

	document.querySelectorAll(".fav-btn").forEach(btn => {
		btn.addEventListener("click", e => {
			e.stopPropagation();
			const channelId = btn.dataset.fav;
			const channelIndex = btn.dataset.index;
			const channel = filtered.find(c => c.id === channelId);
			// console.log(channel)
			if (channel) toggleFavorite(channel, channelIndex);
		});
	});
}

function scrollToMain() {
	const main = document.querySelector('main');
	console.log(main);
	if (!main) return;

	main.scrollIntoView({
		behavior: 'smooth',
		block: 'start'
	});
}


function populateCountries(countries) {
	countries.forEach(c => {
		const opt = document.createElement("option");
		opt.value = c.code;
		opt.textContent = c.name;
		countryFilter.appendChild(opt);
	});
}

function filterPlayableChannels(logosMap) {
	const streamMap = {};

	streams.forEach(s => {
		/* if (s.url && s.url.includes(".m3u8")) {
			streamMap[s.channel] = s.url;
		} */
		streamMap[s.channel] = s.url;
	});

	playable = channels
		.filter(c => streamMap[c.id])
		.map(c => ({
			...c,
			stream: streamMap[c.id],
			logo: logosMap[c.id] || 'https://placehold.co/300x150?text=No+Logo'
			// logo: isUrlRenderable(logosMap[c.id]).then(ok => { ok ? logosMap[c.id] : 'https://placehold.co/300x150?text=No+Logo' })
		}));
	loading.style.display = "none";
}

function setTraveseTexts() {
	if (isMobile() == false) {
		nextIndex = currentChannelIndex + 1;
		if (filtered[nextIndex] == undefined) nextIndex = 0;
		nextBtn.textContent = filtered[nextIndex].name + " ⟩";
		prevIndex = currentChannelIndex - 1;
		if (filtered[prevIndex] == undefined) prevIndex = filtered.length - 1;
		prevBtn.textContent = filtered[prevIndex].name + " ⟨";
	}

	const favBtnModal = document.querySelector(".fav-btn-modal");
	favBtnModal.classList.remove('active');
}

nextBtn.onclick = () => {
	if (filtered.length === 0) return;
	currentChannelIndex = (currentChannelIndex + 1) % filtered.length;
	setTraveseTexts();
	playVideo(filtered[currentChannelIndex].stream);
};
prevBtn.onclick = () => {
	if (filtered.length === 0) return;
	currentChannelIndex = (currentChannelIndex - 1 + filtered.length) % filtered.length;
	setTraveseTexts();
	playVideo(filtered[currentChannelIndex].stream);
};

function playChannel(url) {
	// console.log("Playing channel:", url);
	const statusText = document.getElementById('playerStatus'); // optional overlay

	resetVideoPlayer(video);

	// Remove old HLS instance
	if (window.hls) {
		window.hls.destroy();
		window.hls = null;
	}

	prevBtn.style.display = "none";
	nextBtn.style.display = "none";
	if (isMobile() == false) {
		// Show nav buttons on hover
		modal.onmousemove = () => {
			prevBtn.style.display = "block";
			nextBtn.style.display = "block";
			clearTimeout(modal.hideTimeout);
			modal.hideTimeout = setTimeout(() => {
				prevBtn.style.display = "none";
				nextBtn.style.display = "none";
			}, 2000);
		};
	}

	// Show channel name overlay
	channelName.textContent = filtered[currentChannelIndex].name;
	channelName.classList.remove("hide");
	clearTimeout(channelName.hideTimeout);
	channelName.hideTimeout = setTimeout(() => {
		channelName.classList.add("hide");
	}, 3000);

	if (document.fullscreenElement) {
		showFullscreenChannelNames();
	}

	modal.style.display = "flex";

	// ===== HLS STREAM (.m3u8) =====
	if (url.endsWith('.m3u8')) {
		if (video.canPlayType('application/vnd.apple.mpegurl')) {
			// Safari native HLS
			const source = document.createElement('source');
			source.src = url;
			source.type = 'application/vnd.apple.mpegurl';
			video.appendChild(source);
			video.load();
			video.play();

		} else if (window.Hls && Hls.isSupported()) {
			window.hls = new Hls({
				maxBufferLength: 30,
				liveSyncDurationCount: 3
			});

			window.hls.loadSource(url);
			window.hls.attachMedia(video);

			window.hls.on(Hls.Events.ERROR, function (_, data) {
				if (data.fatal) {
					showPlayerError(videoError);
				}
			});
		} else {
			showPlayerError(videoError);
		}
		return;
	}

	// ===== OGG / MP4 / OTHER =====
	const source = document.createElement('source');
	source.src = url;
	source.type = 'application/x-mpegurl';

	if (url.endsWith('.ogg')) {
		source.type = 'video/ogg';
	} else if (url.endsWith('.mp4')) {
		source.type = 'video/mp4';
	} else {
		source.type = 'video/*';
	}
	video.appendChild(source);
	video.load();
	video.play().catch(() => {
		showPlayerError(videoError);
	});
}

async function playVideo(url) {
	// console.log("Playing channel:", url);
	videoError.style.display = "none"; // hide previous errors
	video.pause();
	// video.src = "";
	video.removeAttribute('src');
	while (video.firstChild) {
		video.removeChild(video.firstChild);
	}

	// Destroy previous players
	if (window.hls) { window.hls.destroy(); window.hls = null; }
	if (window.dashPlayer) { window.dashPlayer.reset(); window.dashPlayer = null; }

	pagination.style.display = "none";
	prevBtn.style.display = "none";
	nextBtn.style.display = "none";
	if (isMobile() == false) {
		// Show nav buttons on hover
		modal.onmousemove = () => {
			prevBtn.style.display = "block";
			nextBtn.style.display = "block";
			clearTimeout(modal.hideTimeout);
			modal.hideTimeout = setTimeout(() => {
				prevBtn.style.display = "none";
				nextBtn.style.display = "none";
			}, 2000);
		};
	}

	if (url.endsWith(".m3u8")) {
		// HLS playback
		if (Hls.isSupported()) {
			const hls = new Hls();
			window.hls = hls;
			hls.loadSource(url);
			hls.attachMedia(video);
			hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
			hls.on(Hls.Events.ERROR, (event, data) => {
				if (data.fatal) {
					videoError.style.display = "block";
					videoError.querySelector("span").textContent = filtered[currentChannelIndex].name + ": ";
				}
			});
		} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = url;
			video.play().catch(() => { });
		} else {
			videoError.textContent = "Your browser does not support HLS streams.";
			videoError.style.display = "block";
		}
	} else if (url.endsWith(".mpd")) {
		// DASH playback
		const player = dashjs.MediaPlayer().create();
		player.initialize(video, url, true);
		player.on("error", (e) => {
			console.error("DASH error", e);
			videoError.style.display = "block";
		});
		window.dashPlayer = player;
	} else if (url.endsWith(".ogg")) {
		// OGG Audio
		audio.style.display = "block";
		audio.src = url;
		audio.play().catch(() => {
			videoError.style.display = "block";
			audio.style.display = "none";
		});
	} else {
		// videoError.textContent = "Unsupported stream format.";
		// videoError.style.display = "block";
		const source = document.createElement('source');
		source.src = url;
		if (url.endsWith('.mp4')) {
			source.type = 'video/mp4';
		} else {
			source.type = 'application/x-mpegurl';
		}
		video.appendChild(source);
		video.load();
		video.play().catch(() => {
			showPlayerError(videoError);
		});
	}

	modal.style.display = "flex";
	
	if (document.fullscreenElement) {
		showFullscreenChannelNames();
	}

	if (filtered[currentChannelIndex]) {
		// Show channel name overlay
		channelName.textContent = filtered[currentChannelIndex].name;
		channelName.classList.remove("hide");
		clearTimeout(channelName.hideTimeout);
		channelName.hideTimeout = setTimeout(() => {
			channelName.classList.add("hide");
		}, 3000);
	
		const channelId = filtered[currentChannelIndex].id;
		const isFav = isFavorite(channelId);
		const favBtnModal = modal.querySelector(".fav-btn-modal");
		favBtnModal.dataset.fav = channelId;
		favBtnModal.style.cursor = "default";
		favBtnModal.removeEventListener("click", () => { });

		if (isFav == true) {
			favBtnModal.textContent = '★';
			favBtnModal.classList.add('active');
		} else {
			favBtnModal.textContent = '☆';
			favBtnModal.classList.remove('active');
			favBtnModal.style.cursor = "pointer";
			/* favBtnModal.addEventListener("click", e => {
				// e.stopPropagation();
				const channel = filtered.find(c => c.id === channelId);
				console.log(channel);
				if (channel) toggleFavorite(channel);
				this.removeEventListener("click", () => {});
			}); */
		}

	}
}

closeModal.onclick = () => {
	video.pause();
	video.src = "";
	audio.pause();
	audio.src = "";
	modal.style.display = "none";
	videoError.style.display = "none";
	pagination.style.display = "flex";
	const favBtnModal = document.querySelector(".fav-btn-modal");
	favBtnModal.classList.remove('active');

	if (window.hls) { window.hls.destroy(); window.hls = null; }
	if (window.dashPlayer) { window.dashPlayer.reset(); window.dashPlayer = null; }
};

searchInput.oninput = filterUI;
countryFilter.onchange = filterUI;

function filterUI(playableData) {
	const q = searchInput.value.toLowerCase().trim();
	const country = countryFilter.value.trim();
	filtered.length = 0;

	if (playableData != undefined && typeof playableData.filter === "function") {
		filtered = playableData.filter(c =>
			c.name.toLowerCase().trim().includes(q)
		);
	} else {
		filtered = playable.filter(c =>
			c.name.toLowerCase().trim().includes(q) &&
			(!country || c.country === country)
		);
	}
	// console.log(filtered);
	// renderChannels(filtered);
	applyCountryFilter(filtered);
}

async function isUrlRenderable(url) {
	if (!url) return false;
	try {
		const res = await fetch(url, { method: 'HEAD' });
		if (!res.ok) return false;
		const ct = res.headers.get('content-type') || '';
		return /^(image|video|text|application)/.test(ct);
	} catch {
		return false;
	}
}

function showToast(message, type = "info", duration = 3000) {
	const container = document.getElementById("toastContainer");
	const toast = document.createElement("div");
	toast.className = `toast ${type}`; // add type class
	toast.textContent = message;
	container.appendChild(toast);

	// Trigger animation
	setTimeout(() => toast.classList.add("show"), 100);

	// Remove after duration
	setTimeout(() => {
		toast.classList.remove("show");
		setTimeout(() => container.removeChild(toast), 300);
	}, duration);
}

function showPlayerError(el) {
	if (!el) return;
	// el.classList.remove('hidden');
	el.style.display = "none";
}

function parseM3U(content) {
	const lines = content.split("\n");
	const channels = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("#EXTINF")) {
			const infoLine = lines[i];
			const urlLine = lines[i + 1] || "";
			const nameMatch = infoLine.match(/,(.*)/);
			const name = nameMatch ? nameMatch[1] : "Unknown Channel";

			if (urlLine && (urlLine.endsWith(".m3u8") || urlLine.endsWith(".mpd"))) {
				channels.push({
					id: `ext_${i}`,
					name,
					stream: urlLine,
					logo: "https://placehold.co/300x150?text=Channel",
					country: "N/A"
				});
			}
			i++; // skip next line
		}
	}
	return channels;
}

function showFullscreenChannelNames() {
	if (!document.fullscreenElement) return; // only in fullscreen

	const prevIndex = (currentChannelIndex - 1 + filtered.length) % filtered.length;
	const nextIndex = (currentChannelIndex + 1) % filtered.length;

	prevNameEl.textContent = filtered[prevIndex].name;
	currentNameEl.textContent = filtered[currentChannelIndex].name;
	nextNameEl.textContent = filtered[nextIndex].name;

	fullscreenOverlay.style.display = "flex";
	fullscreenOverlay.classList.remove("hide");

	clearTimeout(fullscreenOverlay.hideTimeout);
	fullscreenOverlay.hideTimeout = setTimeout(() => {
		fullscreenOverlay.classList.add("hide");
	}, 3000);
}

function enterFullscreen(el) {
	if (el.requestFullscreen) el.requestFullscreen();
	else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
	else if (el.msRequestFullscreen) el.msRequestFullscreen();
}

function exitFullscreen() {
	if (document.exitFullscreen) document.exitFullscreen();
	else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
	else if (document.msExitFullscreen) document.msExitFullscreen();
}

function applyCountryFilter(channels) {
	currentCountryChannels = channels;
	currentPage = 1;
	renderPaginatedChannels();
}

function renderPaginatedChannels() {
	grid.innerHTML = '';

	const total = currentCountryChannels.length;
	const totalPages = getTotalPages();

	// Hide pagination if not needed
	if (total <= CHANNELS_PER_PAGE) {
		pagination.classList.add('hidden');
	} else {
		pagination.classList.remove('hidden');
	}

	const start = (currentPage - 1) * CHANNELS_PER_PAGE;
	const end = start + CHANNELS_PER_PAGE;
	const pageChannels = currentCountryChannels.slice(start, end);

	renderChannels(pageChannels); // your existing card render function
	filtered = pageChannels; // update filtered to full list for navigation

	// Update controls
	pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

	document.getElementById('prevPage').disabled = currentPage === 1;
	document.getElementById('firstPage').disabled = currentPage === 1;

	document.getElementById('nextPage').disabled = currentPage === totalPages;
	document.getElementById('lastPage').disabled = currentPage === totalPages;
}

function keyTouchEvents(e) {
	if (modal.style.display === "flex") {
		if (e.key === "ArrowRight" || e.type === "swiped-left") nextBtn.click();
		if (e.key === "ArrowLeft" || e.type === "swiped-right") prevBtn.click();

		// console.log(isMobile());
		prevBtn.style.display = "none";
		nextBtn.style.display = "none";

		if (isMobile() == false) {
			// show buttons when arrow keys pressed
			prevBtn.style.display = "block";
			nextBtn.style.display = "block";
			clearTimeout(modal.hideTimeout);
			modal.hideTimeout = setTimeout(() => {
				prevBtn.style.display = "none";
				nextBtn.style.display = "none";
			}, 2000);
			// console.log(e.key);
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (!document.fullscreenElement) {
					enterFullscreen(video);
				}
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (document.fullscreenElement) {
					exitFullscreen();
				}
			}
			if (e.key === 'Escape') {
				closeModal.click();
			}
		}
	}
}

document.addEventListener("keydown", e => {
	keyTouchEvents(e);
});
document.addEventListener('swiped-left', e => {
	keyTouchEvents(e);
});
document.addEventListener('swiped-right', e => {
	keyTouchEvents(e);
});

// Listen for fullscreen changes
document.addEventListener("fullscreenchange", () => {
	if (document.fullscreenElement) {
		showFullscreenChannelNames();
	} else {
		fullscreenOverlay.style.display = "none";
	}
});

/* FAVORITES FUNCTIONS */
const showFavs = document.getElementById("showFavs");
let showingFavs = false;

document.getElementById("showFavs").onclick = showFavoritesOnly;
function showFavoritesOnly() {
	const favs = Object.values(getFavorites());
	renderChannels(favs);
}

document.getElementById('firstPage').addEventListener('click', () => {
	if (currentPage !== 1) {
		currentPage = 1;
		renderPaginatedChannels();
	}
});
document.getElementById('prevPage').addEventListener('click', () => {
	if (currentPage > 1) {
		currentPage--;
		renderPaginatedChannels();
	}
});
document.getElementById('nextPage').addEventListener('click', () => {
	const totalPages = getTotalPages();
	if (currentPage < totalPages) {
		currentPage++;
		renderPaginatedChannels();
	}
});
document.getElementById('lastPage').addEventListener('click', () => {
	const totalPages = getTotalPages();
	if (currentPage !== totalPages) {
		currentPage = totalPages;
		renderPaginatedChannels();
	}
});


const FAVORITES_KEY = "iptv_favorites";

// Get favorites object
function getFavorites() {
	return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
}

// Save favorites object
function saveFavorites(favs) {
	localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

// Check if favorite
function isFavorite(channelId) {
	const favs = getFavorites();
	return !!favs[channelId];
}

function toggleFavorite(channel, channelIndex) {
	const favs = getFavorites();

	if (favs[channel.id]) {
		delete favs[channel.id];
	} else {
		favs[channel.id] = channel;
	}

	saveFavorites(favs);
	updateFavoriteUI(channel.id);
}

function updateFavoriteUI(channelId) {
	document.querySelectorAll(`[data-fav="${channelId}"]`)
	.forEach(btn => {
		btn.classList.toggle("active", isFavorite(channelId));
		btn.textContent = isFavorite(channelId) ? "★" : "☆";
		if (showingFavs == true && btn.dataset.index !== undefined) {
			btn.parentElement.parentElement.parentElement.remove();
		}	
	});
}

function resetVideoPlayer(video) {
	video.pause();
	video.removeAttribute('src');

	while (video.firstChild) {
		video.removeChild(video.firstChild);
	}

	// video.load();
}

showFavs.onclick = () => {
	// console.log(showingFavs);
	if (showingFavs == false) {
		showingFavs = true;
		const favs = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
		const favChannels = [];
		showFavs.textContent = "★ Hide Favorites";
		Object.keys(favs).forEach(key => {
			const fav = favs[key];
			// console.log(fav);
			favChannels.push(fav);
		});
		// console.log(favChannels);
		filterUI(favChannels);
		// renderChannels(favs);
	} else {
		showingFavs = false;
		showFavs.textContent = "★ Show Favorites";
		filterUI();
	}
};

function isMobile() {
	const toMatch = [
		/Android/i,
		/BlackBerry/i,
		/iPhone/i,
		/Opera Mini/i,
		/Windows Phone/i
	];
	return toMatch.some((toMatch) => navigator.userAgent.match(toMatch));
}

function getTotalPages() {
	return Math.ceil(
		currentCountryChannels.length / CHANNELS_PER_PAGE
	);
}


loadData();
