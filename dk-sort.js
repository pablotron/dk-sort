/**
 * dk-sort.js: script which makes the following changes to live update
 * articles on dailykos.com:
 *
 * 1. adds a toolbar below the story image which allows you to sort live
 *    update entries or download them as a CSV file.
 * 2. installs a timer which periodically re-sorts live update entries
 *    according to the settings in the toolbar.
 *
 * this extension is based on a bookmarklet which i originally wrote to
 * sort live update entries in chronological (that is, readable) order
 * rather than reverse chronological order.
 *
 * the original bookmarklet is included in the browser extension and git
 * repo as `dk-sort.txt`, and also here: <https://pmdn.org/dk-sort.txt>.
 */
(() => {
  'use strict';

  // refresh interval, in milliseconds
  const DELAY = 3000; // 3s

  // wait() polling interval, in milliseconds
  //
  // a lower value is more cpu intensive, but means the ui panel will
  // appear sooner once the live update entries are rendered
  //
  // a higher value is less cpu intensive, but means there will be a
  // longer delay between when the live update entry are rendered and
  // the ui panel is visibile.
  //
  // 500ms seems like a good balance
  const WAIT_POLL_INTERVAL = 500; // 500ms

  // wait() polling timeout, in milliseconds
  //
  // once this duration is exceeded, wait() will stop polling.
  const WAIT_POLL_TIMEOUT = 120000; // 2m

  // css selectors
  const S = {
    // story image (ui panel rendered below this)
    story_image: 'div.story__image',

    // live update entries
    entries: '.live-update-wrapper',

    // entry counter
    count: '#dk-sort-count',

    // all sort mode radio buttons
    modes: 'input.dk-sort-mode[type="radio"]',

    // active sort mode radio button
    active: 'input.dk-sort-mode[type="radio"]:checked',
  };

  // ui panel settings
  const UI = {
    // about dialog blurb
    about: `
      Sort and download entries on a Daily Kos live update pages.
    `.replace(/^\s*|\s*$/g, ''),

    // sort mode radio buttons
    modes: [{
      key: 'asc',
      name: 'Oldest First',
      help: 'Sort live update entries from oldest to newest.',
      checked: true,
    }, {
      key: 'desc',
      name: 'Newest First',
      help: 'Sort live update entries from newest to oldest.',
      checked: false,
    }],

    // buttons
    buttons: [{
      id: 'about',
      name: 'About',
      help: 'About this panel.',
    }, {
      id: 'download',
      name: 'Download',
      help: 'Download live update entries as a CSV file.',
    }],

    // ui panel wrapper div styles
    styles: {
      padding: '10px', // padding
      border: '1px solid black', // border
      'margin-bottom': '10px', // bottom margin
    },

    // html templates
    templates: {
      // sort mode button html template
      mode: ({key, name, help, checked}) => `
        <label
          for='dk-sort-mode-${key}'
          title='${help}'
          aria-label='${help}'
        >
          <input
            type='radio'
            id='dk-sort-mode-${key}'
            name='dk-sort-mode'
            class='dk-sort-mode'
            value='${key}'
            title='${help}'
            aria-label='${help}'
            ${checked ? 'checked' : ''}
          />
          ${name}
        </label>
      `,

      button: ({id, name, help}) => `
        <button
          id='dk-sort-${id}'
          title='${help}'
          aria-label='${help}'
          style='padding-left: 10px; padding-right: 10px; margin-left: 5px'
        >
          ${name}
        </button>
      `,

      panel: () => `
        <span style='background: #eee; padding-left: 15px; padding-right: 10px'>
          <span
            id='dk-sort-count'
            style='font-weight: normal; text-align: right'
            title='Total number of live update entries.'
            aria-label='Total number of live update entries.'
          >?</span>
        </span>

        <span
          style='margin-left: 10px'
          title='Sort modes.'
          aria-label='Sort modes.'
        >
          <b>Sort Entries:</b> ${UI.modes.map(UI.templates.mode).join('')}
        </span>

        <span style='position: absolute; right: 0; margin-right: 10px'>
          ${UI.buttons.map(UI.templates.button).join(' ')}
        </span>
      `,
    },
  };

  // csv column headers
  const CSV_COLS = ['time_utc', 'text', 'html'].join(',');

  // query selector all
  const qsa = (s) => document.querySelectorAll(s);

  // get epoch time for given entry as number
  const et = (e) => +e.dataset.epochTime;

  // convert epoch to iso8601 string
  const iso8601 = (t) => new Date(+t).toISOString();

  // get current timestamp as iso8601 string
  const now = () => ((new Date()).toISOString());

  // encode value as quoted csv cell
  const csv_cell = (v) => '"' + (v || '').toString().replaceAll('"', '""') + '"';

  // get active sort mode as integer (ascending: 1, descending: -1)
  // note: if there is no active sort mode (e.g., because the ui panel
  // has not been rendered yet), then default to "oldest first".
  const get_mode = () => (document.querySelector(S.active)?.value === 'asc') ? 1 : -1;

  // return entries sorted by given sort mode
  const sort = (es, mode) => {
    es.sort((a, b) => mode * (a.t - b.t));
    return es;
  };

  // get downloadable csv name
  const get_csv_name = (() => {
    const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).*$/,
          NAME_TMPL = (ts) => `dk-sort-entries-${ts}.csv`;
    return () => NAME_TMPL(now().replace(DATE_RE, '$1$2$3-$4$5$6'));
  })();

  // pack extraneous whitespace into a single newline
  const pack = (s) => s.replace(/[\s\r]*\n[\s\r]*/g, "\n");

  // get entries as a sorted array of csv row strings
  const get_csv_rows = (sort_mode) => {
    // get rows
    const rows = Array.from(qsa(S.entries), (e) => ({
      // numeric timestamp (for sorting)
      t: et(e),

      // row string
      s: [
        iso8601(et(e)), // iso8601-formatted entry timestamp
        pack(e.textContent), // compacted plain text
        e.innerHTML, // raw html
      ].map(csv_cell).join(','),
    }));

    // sort, return as array of row strings
    return sort(rows, sort_mode).map(({s}) => s);
  };

  // convert array of row strings to base64-encoded blob
  const encode_rows = (rows) => {
    const text = new TextEncoder().encode(rows.join("\n"));
    return btoa(Array.from(text, (b) => String.fromCharCode(b)).join(''));
  };

  // download file with given name and data
  //
  // works by appending a temporary `a` element with a `download`
  // attribute and a data URL `href` attribute, triggering a `click`
  // event, and then removing the temporary element.
  const download_file = ({name, type, data}) => {
    // build data url
    const data_url = `data:${type};base64,${data}`;

    // create temporary anchor element
    let a = document.createElement('a');

    // set file name and data url
    a.download = name;
    a.href = data_url;

    document.body.appendChild(a); // add element to dom
    a.click(); // trigger download
    document.body.removeChild(a); // remove element
  };

  // sort entries
  // note: called on init, by setInterval, and by on_click_mode
  const refresh = () => {
    // get sorted entries
    const E = sort(Array.from(qsa(S.entries), (e) => ({
      h: e.innerHTML,
      t: et(e),
    })), get_mode());

    // update counter
    document.querySelector(S.count).textContent = E.length;

    // refresh elements (update body and epochtime of elements inline)
    qsa(S.entries).forEach((e, i) => {
      e.innerHTML = E[i].h;
      e.dataset.epochTime = E[i].t;
    });
  };

  // predicate function which returns `true` if there are live update
  // entries, and `false` otherwise.  used to defer timer initialization
  // until there are live update entries.
  const timer_is_ready = () => qsa(S.entries).length > 0;

  // predicate function returns `true` if both of the following
  // conditions are true, and `false` otherwise:
  //
  // 1. the story image exists.
  // 2. there is at least one visible live update entry.
  //
  // used to defer ui panel initialization until there is something to
  // fiddle with, and to prevent showing the ui panel on non-live update
  // pages.
  const ui_is_ready = () => !!document.querySelector(S.story_image) && timer_is_ready();

  // returns a promise which behaves as follows:
  //
  // 1. poll until result of predicate function is `true`, then resolve
  //    returned promise.
  // 2. if poll timeout is reached and predicate still has not
  //    succeeded, then reject returned promise.
  //
  // polling interval and timeout are specified in the `WAIT_POLL_*`
  // constants defined in the header of this file.
  const wait = (pred) => new Promise((resolve, reject) => {
    const t0 = Date.now(); // get start time

    // add polling timer
    const timer = setInterval(() => {
      if (pred()) {
        // predicate succeeded, remove timer and resolve promise
        clearInterval(timer); // remove timer
        resolve(); // resolve promise
      } else if (Date.now() - t0 > WAIT_POLL_TIMEOUT) {
        // timeout exceeded, remove timer and reject promise
        clearInterval(timer); // remove timer
        reject(); // reject promise
      }
    }, WAIT_POLL_INTERVAL);
  });

  // event handlers
  const handlers = {
    // sort mode radio button click event handler
    mode: () => {
      // refresh entries after 10ms
      setTimeout(refresh, 10);
    },

    // download button click event handler
    // todo: wanted to use embedded about.html, but not worth effort
    about: () => alert(UI.about),

    // download button click event handler
    download: () => download_file({
      name: get_csv_name(),
      type: 'text/csv',
      data: encode_rows([CSV_COLS].concat(get_csv_rows(get_mode()))),
    }),
  };

  // render ui panel to body of given element, set
  // padding and border of element, then return element
  const ui_draw = (e) => {
    // render panel body
    e.innerHTML = UI.templates.panel();

    // apply styles
    for (let [key, val] of Object.entries(UI.styles)) {
      e.style[key] = val;
    }

    // return element
    return e;
  };

  // init UI panel
  //
  // this functions in an odd way; the live update pages use react and
  // don't immediately render the content on page load, we wait until
  // the story image and at least one live update entry are present,
  // then render and attach the ui panel below the story image.
  wait(ui_is_ready).then(() => {
    // get story image, render ui, append ui after story image
    const im = document.querySelector(S.story_image);
    im.append(ui_draw(document.createElement('div')));

    // update counter
    document.querySelector(S.count).textContent = qsa(S.entries).length;

    // add click handlers
    qsa(S.modes).forEach((e) => e.addEventListener('click', handlers.mode));
    UI.buttons.forEach(({id}) => document.querySelector(`#dk-sort-${id}`).addEventListener('click', handlers[id]));
  });

  // init periodic timer
  //
  // same note as above; the live update pages use react and don't
  // immediately render their content on page load, so wait until at
  // least one live update entry is present, then install the periodic
  // sort timer.
  wait(timer_is_ready).then(() => {
    setInterval(refresh, DELAY); // start refresh timer
    refresh(); // sort entries initially
  });
})();
