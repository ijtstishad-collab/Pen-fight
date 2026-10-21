// Rewarded ads: plays a Fresh Stationery video from YouTube and grants the reward once
// enough of it has actually been watched (seeking ahead doesn't count).
(function (root) {
  'use strict';

  const REWARD_SHARE = 0.3; // fraction of the video that must be watched
  const LOAD_TIMEOUT = 12000;

  // Fresh Stationery TV commercials from https://www.youtube.com/@freshstationery1296
  const VIDEOS = [
    { id: 'MXa66YpbQ64', title: 'Fresh Pen · Bari Vaag' },
    { id: 'YwDHHZUc3yo', title: 'Fresh Exercise Book' },
    { id: 'uuOMfTMYYMc', title: 'Fresh Sewing Exercise Book' },
    { id: 'tdyPLm9tDLE', title: 'Back to School' },
    { id: 'AGzMZj5ZbUA', title: "Teacher's Day 2024" },
  ];

  let apiPromise = null;
  function loadApi() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const prev = root.onYouTubeIframeAPIReady;
      root.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve(root.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube could not be reached'));
      };
      document.head.append(s);
    });
    return apiPromise;
  }

  let lastIndex = -1;
  function pickVideo() {
    let i = Math.floor(Math.random() * VIDEOS.length);
    if (i === lastIndex) i = (i + 1) % VIDEOS.length;
    lastIndex = i;
    return VIDEOS[i];
  }

  // Shows the ad dialog. Resolves true if the viewer earned the reward, false if they left early.
  function watch() {
    const dlg = document.getElementById('ad');
    const slot = document.getElementById('ad-player');
    const bar = document.getElementById('ad-progress');
    const label = document.getElementById('ad-label');
    const title = document.getElementById('ad-title');
    const close = document.getElementById('ad-close');
    const retry = document.getElementById('ad-retry');

    return new Promise((resolve) => {
      let player = null;
      let timer = null;
      let loadTimer = null;
      let watched = 0;
      let lastTime = null;
      let lastTick = 0;
      let earned = false;
      let progressAt = 0; // last time playback moved forward

      function setProgress(share) {
        bar.style.width = `${Math.min(1, share / REWARD_SHARE) * 100}%`;
        bar.parentElement.setAttribute('aria-valuenow', String(Math.round(Math.min(1, share / REWARD_SHARE) * 100)));
      }

      function unlock() {
        if (earned) return;
        earned = true;
        dlg.classList.add('earned');
        label.textContent = 'Revive unlocked! Keep watching or claim it now.';
        close.textContent = 'Claim revive';
        close.classList.add('primary');
      }

      function tick() {
        if (!player || typeof player.getPlayerState !== 'function') return;
        const now = performance.now();
        const wall = (now - lastTick) / 1000;
        lastTick = now;
        const duration = player.getDuration() || 0;
        if (player.getPlayerState() === root.YT.PlayerState.PLAYING) {
          const t = player.getCurrentTime();
          if (lastTime !== null) {
            const d = t - lastTime;
            // Only count playback that kept pace with the clock; jumps from seeking are ignored.
            if (d > 0 && d <= wall * 2 + 0.25) {
              watched += d;
              progressAt = now;
            }
          }
          lastTime = t;
        } else {
          lastTime = null;
        }
        if (!earned && progressAt && now - progressAt > 8000) {
          // Stuck buffering, blocked or paused for a while: offer a different ad.
          retry.hidden = false;
        }
        if (duration > 0) {
          const share = watched / duration;
          setProgress(share);
          if (share >= REWARD_SHARE) unlock();
          else {
            const left = Math.max(1, Math.ceil(duration * REWARD_SHARE - watched));
            label.textContent = `Watch ${left}s more to revive your pen`;
          }
        }
      }

      function fail(msg) {
        clearTimeout(loadTimer);
        label.textContent = msg;
        retry.hidden = false;
      }

      function start() {
        retry.hidden = true;
        progressAt = 0;
        watched = 0;
        lastTime = null;
        setProgress(0);
        const video = pickVideo();
        title.textContent = video.title;
        label.textContent = 'Loading ad…';
        const holder = document.createElement('div');
        slot.replaceChildren(holder);
        loadTimer = setTimeout(() => fail('The ad is taking too long to load.'), LOAD_TIMEOUT);
        loadApi()
          .then((YT) => {
            player = new YT.Player(holder, {
              host: 'https://www.youtube-nocookie.com',
              videoId: video.id,
              playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
              events: {
                onReady: (e) => {
                  clearTimeout(loadTimer);
                  progressAt = performance.now();
                  e.target.playVideo();
                  label.textContent = 'Watch 30% of the ad to revive your pen';
                },
                onStateChange: (e) => {
                  if (e.data === YT.PlayerState.ENDED && earned) finish(true);
                },
                onError: () => fail('This ad could not be played.'),
              },
            });
            lastTick = performance.now();
            timer = setInterval(tick, 250);
          })
          .catch((err) => fail(`${err.message}. Check the connection and try again.`));
      }

      function finish(result) {
        clearInterval(timer);
        clearTimeout(loadTimer);
        if (player && player.destroy) player.destroy();
        player = null;
        slot.replaceChildren();
        dlg.hidden = true;
        dlg.classList.remove('earned');
        close.textContent = 'Close';
        close.classList.remove('primary');
        close.onclick = null;
        retry.onclick = null;
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      }

      function onKey(evt) {
        if (evt.key === 'Escape') {
          evt.stopPropagation();
          finish(earned);
        }
      }

      close.onclick = () => finish(earned);
      retry.onclick = () => {
        clearInterval(timer);
        if (player && player.destroy) player.destroy();
        player = null;
        start();
      };
      document.addEventListener('keydown', onKey, true);
      dlg.hidden = false;
      close.focus();
      start();
    });
  }

  root.PenAds = { watch, REWARD_SHARE, VIDEOS };
})(window);
