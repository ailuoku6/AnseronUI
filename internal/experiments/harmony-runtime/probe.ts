let output = '';
let finish: (value: string) => void = () => {};
let fail: (reason: Error) => void = () => {};

export function sync(): string {
  const values = [3, 1, 4];
  const map = new Map<string, number>();
  map.set('鸿蒙', values.reduce((sum, n) => sum + n, 0));
  const json = JSON.parse('{"message":"鸿蒙😀","value":21}');
  let caught = '';
  try { throw new Error('caught'); } catch (error) { caught = (error as Error).message; }
  return JSON.stringify({ message: json.message, value: json.value, sum: map.get('鸿蒙'), caught });
}

export function start(): void {
  output = 'sync';
  const promise = new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; });
  async function nested(): Promise<string> { return await promise; }
  async function task(): Promise<void> {
    output += ':prefix';
    try { output += ':' + await nested(); } catch (error) { output += ':caught:' + (error as Error).message; }
    output += ':done';
  }
  void task();
}
export function resolve(value: string): void { finish(value); }
export function reject(): void { fail(new Error('host-rejection')); }
export function read(): string { return output; }
