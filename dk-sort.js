(() => {
  'use strict';

  // refresh interval, in milliseconds
  const DELAY = 3000; // 3s

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

  // initialize UI panel
  //
  // this functions in an odd way; the live update pages use react and
  // don't immediately render the content on page load, we poll at 500ms
  // intervals until the story image has been rendered, then render and
  // attach the ui panel below that.
  const ui_init = () => {
    // render ui to body of given element, set
    // padding and border of element, then return element
    const draw = (e) => {
      // render panel body
      e.innerHTML = UI.templates.panel();

      // apply styles
      for (let [key, val] of Object.entries(UI.styles)) {
        e.style[key] = val;
      }

      // return element
      return e;
    };

    // wait until story image is rendered, then add ui panel
    let timer = setInterval(() => {
      // get story image, return if undefined
      const im = document.querySelector(S.story_image);
      if (!im) {
        return;
      }

      // remove polling timer
      clearInterval(timer);

      // render ui, append after story image
      im.append(draw(document.createElement('div')));

      // add click handlers
      qsa(S.modes).forEach((e) => e.addEventListener('click', handlers.mode));
      UI.buttons.forEach(({id}) => document.querySelector(`#dk-sort-${id}`).addEventListener('click', handlers[id]));
    }, 500);
  };

  ui_init(); // init ui
  setInterval(refresh, DELAY); // start refresh timer
  refresh(); // sort entries initially
})();
