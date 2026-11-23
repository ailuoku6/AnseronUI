import { ScrollView, Text, View, definePage, useEffect, useRef, useState, useTimers, type NodeHandle } from '@anseronui/ui';

function CaptureCard() {
  return <View style={{height:80,flexShrink:0,backgroundColor:'#ffffff'}}>
    <Text testID="devtools-target" style={{width:200,height:40,fontSize:20}}>Native screenshot target</Text>
  </View>;
}
function NativeCapture() {
  const ref = useRef<NodeHandle | null>(null);
  const timers = useTimers();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = timers.setTimeout(async () => {
      if (ref.current) {
        await ref.current.scrollTo(0,120,false);
        setReady(true);
      }
    }, 1500);
    return () => timers.clearTimeout(timer);
  }, []);
  return <View style={{width:300,height:400,flexDirection:'column',backgroundColor:'#f5f7fb'}}>
    <Text testID="devtools-ready" style={{height:40}}>{ready?'capture-ready':'waiting-scroll'}</Text>
    <ScrollView ref={ref} testID="devtools-scroll" style={{width:300,height:320,flexDirection:'column'}}>
      <View style={{width:300,height:820,flexShrink:0,flexDirection:'column'}}>
        <View style={{height:240,flexShrink:0,backgroundColor:'#3559dc'}} />
        <CaptureCard />
        <View style={{height:500,flexShrink:0,backgroundColor:'#e8ecf4'}} />
      </View>
    </ScrollView>
  </View>;
}
export const nativeCapturePage = definePage('devtools-native',NativeCapture);
