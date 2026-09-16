/* Harvest report intake.
 *
 * Submits to Formspree in the background so a grower who has just told us something useful is
 * not thrown onto a third-party thank-you page and made to find their way back. A failed send
 * says so and leaves the form filled in — losing someone's typed-out harvest report because a
 * network hiccup is the fastest way to never get a second one.
 *
 * Every field maps to a column in assets/data/observations.json, so a report arrives ready to
 * be scored against what the model predicted before the harvest date.
 */
(function () {
  'use strict';
  var form = document.getElementById('nbReport');
  if (!form) return;

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = form.querySelector('button[type=submit]');
    var was = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('rejected');
      var crop = form.querySelector('[name=crop]').value;
      var lb = form.querySelector('[name=lb_ac]').value;
      var note = document.createElement('div');
      note.className = 'nbFormSent';
      note.innerHTML = '<b>Thank you — that is the most useful thing on this page.</b><br>' +
        (crop && lb
          ? 'Recorded: ' + crop + ' at ' + Number(lb).toLocaleString() + ' lb/ac. '
          : '') +
        'It will be scored against what this model predicted before your harvest date, and ' +
        'the difference becomes a correction that carries to regions which will never report ' +
        'a yield of their own.';
      form.parentNode.replaceChild(note, form);
      note.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = was;
      var err = form.querySelector('.nbFormErr');
      if (!err) {
        err = document.createElement('p');
        err.className = 'nbFormErr nbOpt';
        err.style.color = '#9e1b0e';
        form.querySelector('.nbFormFoot').appendChild(err);
      }
      err.textContent = 'That did not send. Your answers are still here — try again, or ' +
        'email them to us directly rather than losing them.';
    });
  });
})();
