// A failed dependency setup should produce a useful screen, not a blank board.
import('./main.js').catch(error => {
  console.error('Shadow Chess could not start.', error);
  document.getElementById('turn-title').textContent = 'Setup required';
  document.getElementById('status').textContent = 'Run npm install in the project folder, then reload. If setup is complete, check the browser console for the startup error.';
  document.getElementById('board').innerHTML = '<p class="setup-message">The battlefield is being prepared.<br><code>npm install</code><br>Then reload this page.</p>';
  for (const id of ['undo', 'flip', 'restart']) document.getElementById(id).disabled = true;
});
