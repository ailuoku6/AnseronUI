import { View, Text, Button, Image, Video, definePage, useState, useRouter, useRef, useServices, createNativeComponent } from '@anseronui/ui';
import type { UIElement, NodeHandle, NativeComponentEvent } from '@anseronui/ui';
const DemoSwitch = createNativeComponent<{value: boolean}>('DemoSwitch');
export function HarmonyMediaCheck(): UIElement {
  const router = useRouter();
  const services = useServices(), native = useRef<NodeHandle | null>(null);
  const [enabled, setEnabled] = useState(false), [extension, setExtension] = useState('waiting');
  const [playing, setPlaying] = useState(true);
  const [loaded, setLoaded] = useState('waiting'), [image, setImage] = useState('waiting');
  const [first, setFirst] = useState('waiting'), [state, setState] = useState('waiting');
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0);
  return <View style={{ flexDirection: 'column', gap: 12, padding: 16 }}>
    <Text testID="media-title">Harmony media</Text>
    <Image src="asset://showcase.png" style={{ width: 100, height: 60 }} onLoad={setImage} onError={(_source: string, code: number) => setImage('error:' + code)} />
    <Text testID="media-image">{image}</Text>
    <Video src="asset://showcase.mp4" muted controls={false} loop playControl={playing ? 'play' : 'pause'} style={{ width: 300, height: 170 }}
      onError={(_source: string, code: number) => setLoaded('error:' + code)}
      onFirstFrame={() => { setFirst('displayed'); setLoaded('ready'); }} onPlaybackStateChange={setState}
      onTimeUpdate={(position: number, length: number) => { setTime(position); setDuration(length); }} />
    <Text testID="media-loaded">{loaded}</Text><Text testID="media-first">{first}</Text>
    <Text testID="media-state">{state}</Text><Text testID="media-time">Time:{Math.round(time)} Duration:{Math.round(duration)}</Text>
    <Button testID="media-pause" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(value => !value)} />
    <Button testID="media-cover" title="Cover media" onClick={() => { void router.push('harmony-details', { message: 'media' }); }} />
    <DemoSwitch ref={native} testID="media-switch" nativeProps={{value: enabled}} style={{width: 100, height: 36}} onNativeEvent={(event: NativeComponentEvent) => { if(event.name === 'change') { setEnabled((event.data as {value: boolean}).value); setExtension('event'); } }} />
    <Button testID="media-extension" title="Native toggle and module" onClick={async () => {
      try { const result = await native.current!.invoke<{value: boolean}>('toggle'); setEnabled(result.value);
        const platform = await services.invoke<{platform: string}>('device','info',{}); setExtension(platform.platform + '-ref');
      } catch(error) { setExtension(String(error)); }
    }} />
    <Text testID="media-extension-status">{extension} {enabled ? 'on' : 'off'}</Text>
  </View>;
}
export const harmonyMediaPage = definePage('harmony-media', HarmonyMediaCheck);
