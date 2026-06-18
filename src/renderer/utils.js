(function(){
  function getIconUrl(name) {
    if (!name) return 'appicon://blank.png';
    return `appicon://${name}.png`;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function prettifyAppName(name) {
    if (!name || typeof name !== 'string') return name;
    return name.split('-').map(word => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  window.utils = Object.freeze({
    getIconUrl,
    debounce,
    prettifyAppName
  });
})();