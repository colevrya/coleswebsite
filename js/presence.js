function updateProgressBar(start, end) {
  clearInterval(progressInterval);
  const discordBox = document.getElementById('discord-activity');

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const total = end - start;
    const progress = Math.min(Math.max(elapsed / total, 0), 1) * 100;

    const timeElems = discordBox.querySelectorAll('.spotify-progress .time');
    const fillBar = discordBox.querySelector('.spotify-progress .fill');

    if (!fillBar || timeElems.length !== 2) return;

    timeElems[0].textContent = formatTime(elapsed);
    timeElems[1].textContent = formatTime(total);
    fillBar.style.width = `${progress}%`;

    if (elapsed >= total) clearInterval(progressInterval);
  }, 1000);
}

async function handleActivity(data) {
  const now = Date.now();
  const discordBox = document.getElementById('discord-activity');
  let html = '';

  const statusDot = document.querySelector('.status-dot');
  const status = data.discord_status;
  statusDot.className = `status-dot status-${status}`;

  if (data.spotify) {
    const s = data.spotify;
    const total = s.timestamps.end - s.timestamps.start;
    const elapsed = now - s.timestamps.start;
    const progress = Math.min(Math.max(elapsed / total, 0), 1) * 100;

    html += `
      <div class="presence-entry spotify-presence">
        <img src="${s.album_art_url}" class="album-art">
        <div class="music-info">
          <a class="song-title" href="https://open.spotify.com/track/${s.track_id}" target="_blank">
            <img src="icons/spotify.png" class="spotify-icon" />
            ${s.song}
          </a>
          <div class="artist">${s.artist} • ${s.album}</div>
          <div class="spotify-progress">
            <div class="time">${formatTime(elapsed)}</div>
            <div class="bar"><div class="fill" style="width:${progress}%"></div></div>
            <div class="time">${formatTime(total)}</div>
          </div>
        </div>
      </div>
    `;

    updateProgressBar(s.timestamps.start, s.timestamps.end);

    if (!musicLogs.length || musicLogs[0].track_id !== s.track_id || now - musicLogs[0].loggedAt > 30000) {
      musicLogs.unshift({
        track_id: s.track_id,
        song: s.song,
        artist: s.artist,
        album: s.album,
        album_art_url: s.album_art_url,
        loggedAt: now
      });

      if (musicLogs.length > 300) musicLogs.pop();
      await saveLogs();
    }
  } else {
    clearInterval(progressInterval);
  }

  const games = data.activities ? data.activities.filter(a => a.type === 0 && a.name !== 'Custom Status') : [];
  const currentGame = games[0];

  if (currentGame) {
    const gameKey = `${currentGame.name}:${currentGame.details || ''}:${currentGame.state || ''}`;
    const top = gameLogs[0];
    const topKey = top ? `${top.name}:${top.details || ''}:${top.state || ''}` : '';

    if (gameKey !== topKey) {
      gameLogs.unshift({
        name: currentGame.name,
        details: currentGame.details || '',
        state: currentGame.state || '',
        icon: currentGame.application_id || null,
        loggedAt: now
      });

      if (gameLogs.length > 300) gameLogs = gameLogs.slice(0, 300);
      await saveLogs();
    }
  }

  if (games.length > 0) {
    games.forEach(g => {
      const icon = g.application_id
        ? `https://dcdn.dstn.to/app-icons/${g.application_id}?ext=webp&size=64`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      html += `
        <div class="presence-entry">
          <img src="${icon}" class="album-art">
          <div class="music-info">
            <div class="song-title">${g.name}</div>
            <div class="artist">${g.details || ''}</div>
            <div class="artist">${g.state || ''}</div>
          </div>
        </div>
      `;
    });
  }

  discordBox.innerHTML = html || 'Not currently playing anything.';
  discordBox.classList.toggle('active', !!html);
}