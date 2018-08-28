import { resolveIfNotPlainOrUrl, baseUrl as pageBaseUrl, createPackageMap } from './common.js';

let id = 0;
const registry = Object.create(null);
const head = { item: null, next: null };

async function topLevelLoad (url, source) {
  const load = await resolveDeps(getOrCreateLoad(url, source), head);
  
  const s = document.createElement('script');
  s.type = 'module';
  s.src = load.blobUrl;
  document.head.appendChild(s);
}
async function resolveDeps (load, parents) {
  const depLoads = await load.depsPromise;

  let source = await load.fetchPromise;
  let resolvedSource;
  if (!depLoads.length) {
    resolvedSource = source;
  }
  else {
    const parent = { item: load, next: parents };

    await Promise.all(depLoads.map(depLoad => {
      let curParent = parents;
      while (curParent) {
        if (curParent === depLoad)
          throw new Error('Cycles not supported');
        curParent = curParent.next;
      } 
      return resolveDeps(depLoad, parent);
    }));

    // once all deps have loaded we can inline the dependency resolution blobs
    // and define this blob
    let lastIndex = 0;
    resolvedSource = '';
    for (let i = 0; i < load.deps.length; i++) {
      const { start, end } = load.deps[i];
      const depLoad = depLoads[i];
      resolvedSource += source.slice(lastIndex, start) + depLoad.blobUrl;
      lastIndex = end;
    }
    resolvedSource += source.slice(lastIndex);
  }

  load.blobUrl = URL.createObjectURL(new Blob([resolvedSource], {type : 'application/javascript'}));
  return load;
}
function getOrCreateLoad (url, source) {
  let load = registry[url];
  if (load)
    return load;
  
  const fetchPromise = source ? Promise.resolve(source) : fetch(url).then(res => res.text());

  const depsPromise = async () => {
    const source = await fetchPromise;
    load.deps = analyzeDeps(source);
    return Promise.all(
      load.deps.map(async dep => {
        const load = getOrCreateLoad(await resolve(dep.id, url));
        await load.fetchPromise
        return load;
      })
    );
  };

  return load = registry[url] = {
    url,
    fetchPromise,
    depsPromise: depsPromise(),
    deps: undefined,
    blobUrl: undefined
  };
}

// TODO: comment, string and template location opt-outs
// const commentRegEx = /(^|[^\\])(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;
// const stringRegEx = /("[^"\\\n\r]*(\\.[^"\\\n\r]*)*"|'[^'\\\n\r]*(\\.[^'\\\n\r]*)*')/g;
// const templateRegEx = /`([^`\\](\\\\)*\\[^])*`/g;

// this can work if we can properly restrict out comment, string and template locations as above
const importRegEx = /(^\s*|[}\);\n]\s*)(import\s*['"](.+)['"]|(import|export)\s*(.+)\s*from\s*['"](.+)['"])/g;

// extracts dependencies and their locations form the source using regexes
function analyzeDeps (source) {
  importRegEx.lastIndex = 0;

  const deps = [];
  var match;

  // track string and comment locations for unminified source
  /*
  var stringLocations = [], commentLocations = [];

  function inLocation (locations, match) {
    for (var i = 0; i < locations.length; i++)
      if (locations[i][0] < match.index && locations[i][1] > match.index)
        return true;
    return false;
  }

  if (source.length / source.split('\n').length < 200) {
    while (match = stringRegEx.exec(source))
      stringLocations.push([match.index, match.index + match[0].length]);

    // TODO: track template literals here before comments

    while (match = commentRegEx.exec(source)) {
      // only track comments not starting in strings
      if (!inLocation(stringLocations, match))
        commentLocations.push([match.index + match[1].length, match.index + match[0].length - 1]);
    }
  }
  */

  while (match = importRegEx.exec(source)) {
    // ensure we're not within a string or comment location
    // if (!inLocation(stringLocations, match) && !inLocation(commentLocations, match)) {
      const dep = match[3] || match[6];
      deps.push({
        id: dep,
        start: match.index + match[0].length - 1 - dep.length,
        end: match.index + match[0].length - 1
      });
    // }
  }

  return deps;
}

let packageMapPromise, packageMapResolve;
const scripts = document.getElementsByTagName('script');
for (let i = 0; i < scripts.length; i++) {
  const script = scripts[i];
  if (script.type !== 'pmp-packagemap')
    continue;
  if (packageMapResolve)
    break;
  if (!script.src) {
    packageMapResolve = createPackageMap(JSON.parse(script.innerHTML), pageBaseUrl);
    packageMapPromise = Promise.resolve();
  }
  else
    packageMapPromise = fetch(script.src)
    .then(function (res) {
      return res.json();
    })
    .then(function (json) {
      packageMapResolve = createPackageMap(json, script.src);
      packageMapPromise = undefined;
    }, function () {
      packageMapResolve = throwBare;
      packageMapPromise = undefined;
    });
}
if (!packageMapPromise)
  packageMapResolve = throwBare;

for (let i = 0; i < scripts.length; i++) {
  const script = scripts[i];
  if (script.type === 'pmp-module') {
    if (script.src)
      topLevelLoad(script.src);
    else
      topLevelLoad(`${pageBaseUrl}anon-${id++}`, script.innerHTML);
  }
}

function throwBare (id, parentUrl) {
  throw new Error('Unable to resolve bare specifier "' + id + (parentUrl ? '" from ' + parentUrl : '"'));
}

function resolve (id, parentUrl) {
  parentUrl = parentUrl || pageBaseUrl;

  const resolvedIfNotPlainOrUrl = resolveIfNotPlainOrUrl(id, parentUrl);
  if (resolvedIfNotPlainOrUrl)
    return resolvedIfNotPlainOrUrl;
  if (id.indexOf(':') !== -1)
    return id;

  // now just left with plain
  // (if not package map, packageMapResolve just throws)
  if (packageMapPromise)
    return packageMapPromise
    .then(function () {
      return packageMapResolve(id, parentUrl);
    });

  return packageMapResolve(id, parentUrl);
}