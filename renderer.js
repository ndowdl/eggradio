const path = require('path');
const fs = require('fs');
const { ipcRenderer } = require('electron');

let queue = [];
let currentTrackIndex = 0;
let currentHowl = null;
let currentTrackDir = null;
let isPlaying = false;
let seekbar = document.getElementById('seekbar');
let seekbarInterval = null;

function updateMetadata(index) {

  const songTitle = document.getElementById('songinfo');
  const albumCover = document.getElementById('albumcover');

  if (!currentTrackDir && !isPlaying) {
    songTitle.textContent = 'No song playing';
    albumCover.style.backgroundImage = 'none';
    return;
  }

  const filePath = getCurrentTrackPath();

  fs.readFile(filePath, (err, buffer) => {
    if (err) {
      songTitle.textContent = path.basename(filePath);
      albumCover.style.backgroundImage = 'none';
      return;
    }

    jsmediatags.read(buffer, {
      onSuccess: function(tag) {
        const title = tag.tags.title || path.basename(filePath);
        const artist = tag.tags.artist || 'Unknown Artist';
        songTitle.textContent = `${artist} - ${title}`;

        if (tag.tags.picture) {
          const { data, format } = tag.tags.picture;
          let base64String = Buffer.from(data).toString('base64');
          albumCover.style.backgroundImage = `url(data:${format};base64,${base64String})`;
          albumCover.style.backgroundSize = '275px';
          albumCover.style.backgroundPosition = 'center';
        } else {
          albumCover.style.backgroundImage = 'none';
        }

        console.log(tag);
      },
      onError: function(error) {
        songTitle.textContent = path.basename(filePath);
        albumCover.style.backgroundImage = 'none';
      }
    });
  });
}

function clearQueue() {
  if (isPlaying && queue.length > 0 && currentTrackIndex < queue.length) {
    currentTrackDir = queue[currentTrackIndex];
  }
  if (!isPlaying) {
    currentTrackDir = null;
  }
  queue = [];
  currentTrackIndex = 0;
  updateQueueDisplay();
}

function updateQueueDisplay() {
  const queueList = document.getElementById('queue');
  queueList.innerHTML = '';
  queue.forEach((track, idx) => {
    const li = document.createElement('li');
    const songBtn = document.createElement('button');
    songBtn.textContent = path.basename(track);
    songBtn.style.fontWeight = idx === currentTrackIndex ? 'bold' : 'normal';
    songBtn.style.marginRight = '10px';
    songBtn.onclick = () => {
      currentTrackIndex = idx;
      playTrack(currentTrackIndex);
      updateTitle(currentTrackIndex);
    };
    li.appendChild(songBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = 'X';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (idx === currentTrackIndex) {
        if (currentHowl) {
          currentHowl.stop();
          currentHowl.unload();
          currentHowl = null;
        }
        isPlaying = false;
        currentTrackDir = null;
        currentTrackIndex = 0;
      } else if (idx < currentTrackIndex) {
        currentTrackIndex--;
      }
      queue.splice(idx, 1);
      updateQueueDisplay();
      updateSeekBar();
      updateTitle(currentTrackIndex);
    };
    li.appendChild(delBtn);
    queueList.appendChild(li);
  });
}

function updateSeekBar() {
  if (!currentHowl) {
    seekbar.value = 0;
    seekbar.max = 100;
    return;
  }
  const duration = currentHowl.duration();
  if (duration > 0) {
    seekbar.max = Math.floor(duration);
    seekbar.value = Math.floor(currentHowl.seek());
  } else {
    seekbar.value = 0;
    seekbar.max = 100;
  }
}

function startSeekBarInterval() {
  if (seekbarInterval) clearInterval(seekbarInterval);
  seekbarInterval = setInterval(updateSeekBar, 500);
}

function stopSeekBarInterval() {
  if (seekbarInterval) clearInterval(seekbarInterval);
}

function getCurrentTrackPath() {
  if (queue.length > 0 && currentTrackIndex < queue.length) {
    return queue[currentTrackIndex];
  } else if (currentTrackDir) {
    return currentTrackDir;
  } else {
    return null;
  }
}

function playTrack(index) {
  const trackPath = getCurrentTrackPath();
  if (!trackPath) return;
  if (currentHowl) currentHowl.unload();
  currentHowl = new Howl({
    src: [trackPath],
    html5: true
  });
  currentHowl.play();
  isPlaying = true;
  updatePlayPauseButton();
  startSeekBarInterval();
  currentHowl.once('end', () => {
    stopSeekBarInterval();
    if (queue.length > 0 && currentTrackIndex < queue.length - 1) {
      currentTrackIndex++;
      playTrack(currentTrackIndex);
      updateQueueDisplay();
    } else {
      isPlaying = false;
      updatePlayPauseButton();
      updateSeekBar();
    }
  });
  updateQueueDisplay();
  updateSeekBar();
  updateMetadata(currentTrackIndex);
}

function updatePlayPauseButton() {
  const btn = document.getElementById('playpause');
  btn.textContent = isPlaying ? 'Pause' : 'Play';
}

document.getElementById('add').addEventListener('click', async () => {
  console.log('Add Music button clicked');
  try {
    const filePaths = await ipcRenderer.invoke('show-open-dialog');
    console.log('Selected files:', filePaths);
    if (filePaths && filePaths.length > 0) {
      queue = queue.concat(filePaths);
      updateQueueDisplay();
    }
  } catch (err) {
    console.error('Error opening file dialog:', err);
  }
});

document.getElementById('playpause').addEventListener('click', () => {
  const trackPath = getCurrentTrackPath();
  if (!trackPath) return;
  if (!currentHowl) {
    playTrack(currentTrackIndex);
    updateMetadata(currentTrackIndex);
  } else if (isPlaying) {
    currentHowl.pause();
    isPlaying = false;
    updatePlayPauseButton();
    stopSeekBarInterval();
  } else {
    currentHowl.play();
    isPlaying = true;
    updatePlayPauseButton();
    startSeekBarInterval();
  }
});

document.getElementById('next').addEventListener('click', () => {
  if (queue.length > 0 && currentTrackIndex < queue.length - 1) {
    currentTrackIndex++;
    playTrack(currentTrackIndex);
    updateMetadata(currentTrackIndex);
  }
});

document.getElementById('prev').addEventListener('click', () => {
  if (queue.length > 0 && currentTrackIndex > 0) {
    currentTrackIndex--;
    playTrack(currentTrackIndex);
    updateMetadata(currentTrackIndex);
  }
});

document.getElementById('stop').addEventListener('click', () => {
  if (currentHowl) {
    currentHowl.stop();
    currentHowl.unload();
    currentHowl = null;
    currentTrackDir = null;
  }
  isPlaying = false;
  currentTrackIndex = 0;
  updatePlayPauseButton();
  updateQueueDisplay();
  stopSeekBarInterval();
  updateSeekBar();
  updateMetadata(currentTrackIndex);
});

document.getElementById('clear').addEventListener('click', () => {
  clearQueue();
});

seekbar.addEventListener('input', () => {
  if (currentHowl) {
    const duration = currentHowl.duration();
    let seekTo = Number(seekbar.value);
    if (duration > 0 && seekTo >= duration) {
      seekTo = duration - 0.1;
    }
    currentHowl.seek(seekTo);
    updateSeekBar();
  }
});
