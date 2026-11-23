const basePath = '/__anseronui_devtools';
export async function devtoolsCLI(subject, options = {}) {
  const base = new URL(options.server ?? 'http://127.0.0.1:8091');
  const params = new URLSearchParams();
  for (const [key, dest] of Object.entries({pager:'pagerId',query:'q',q:'q',limit:'limit',offset:'offset',status:'status',level:'level',tag:'tag'})) if (options[key] !== undefined) params.set(dest, options[key]);
  let path;
  let init;
  if (['edit', 'props', 'state', 'shot'].includes(subject)) {
    if (!options.pager || options.id === undefined || !Number.isSafeInteger(Number(options.id))) throw new Error(`inspect ${subject} requires --pager and an integer --id`);
    const command = {type: {props:'inspectProps', edit:'set', state:'state', shot:'shot'}[subject], id:Number(options.id)};
    if (subject === 'edit') {
      if (!options.key || options.value === undefined) throw new Error('inspect edit requires --key and --value <JSON>');
      Object.assign(command, {target:options.target ?? 'p', key:options.key, value:JSON.parse(options.value)});
    }
    path = basePath + '/api/command';
    init = {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pagerId:options.pager,command})};
  } else {
    const details = {'log-detail':'logs','network-detail':'network','native-detail':'native','node-detail':'nodes'};
    if (subject !== 'sessions' && !options.pager) throw new Error(`inspect ${subject} requires --pager <pagerId>`);
    if (details[subject] && options.id === undefined) throw new Error(`inspect ${subject} requires --id`);
    if (!details[subject] && !['sessions','logs','network','native','nodes'].includes(subject)) throw new Error('Usage: anseronui inspect <sessions|logs|network|native|nodes|log-detail|network-detail|native-detail|node-detail|props|state|edit|shot> [--pager id]');
    path = basePath + '/api/inspect/' + (details[subject] ? details[subject] + '/' + encodeURIComponent(options.id) : subject) + '?' + params;
  }
  const response = await fetch(new URL(path, base), {...init, signal:AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}
