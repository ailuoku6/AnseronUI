  private devtoolsOverrides = new Map<number, Map<string, Record<string, unknown>>>();
  private devtoolsWaiters = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: number }>();
  private devtoolsOverlay(surface: Surface, path: string, props: object): Record<string, unknown> {
    const override = this.devtoolsOverrides.get(surface.id)?.get(path);
    if (!override) return props as Record<string, unknown>;
    const original = props as Record<string, unknown>;
    return { ...original, ...override, style: { ...(original.style as object ?? {}), ...(override.style as object ?? {}) } };
  }
  private devtoolsDidCommit(surface: Surface): void {
    const waiter = this.devtoolsWaiters.get(surface.id);
    if (waiter) { this.devtoolsWaiters.delete(surface.id); clearTimeout(waiter.timer); waiter.resolve(); }
    const paths = new Set([...surface.frames.keys(), ...this.flatten(surface.tree).map(node => node.path)]);
    const overrides = this.devtoolsOverrides.get(surface.id);
    for (const path of overrides?.keys() ?? []) if (!paths.has(path)) overrides!.delete(path);
  }
  private devtoolsWireType(value: unknown): string | undefined {
    return typeof value === 'string' ? 'String' : typeof value === 'boolean' ? 'Boolean' : typeof value === 'number' && Number.isFinite(value) ? 'Double' : undefined;
  }
  private devtoolsSchema(surface: Surface, id: number): Array<{ key: string; wireType: string; inputType: string; group: string; description: string; reported: boolean; readable: boolean; currentValue?: unknown }> {
    const node = this.devtoolsNodes(surface).find(node => node.id === id);
    if (!node || id === -2) throw new Error('UNKNOWN_NODE');
    const definitions: Array<{ key: string; wireType: string; inputType: string; group: string; description: string; reported: boolean; readable: boolean; currentValue?: unknown }> = [];
    const add = (key: string, wireType: string, group: string) => {
      if (['__proto__','constructor','prototype','children','ref','name','nativeProps','style','key'].includes(key) || key.startsWith('on')) return;
      definitions.push({ key, wireType, inputType: wireType === 'String' ? 'string' : wireType === 'Boolean' ? 'boolean' : 'number', group, description: key, reported: key in node.props, readable: key in node.props, currentValue: node.props[key] });
    };
    if (id < 0) {
      for (const key of Object.keys(node.props)) { const type = this.devtoolsWireType(node.props[key]); if (type) add(key, type, '组件'); }
    } else {
      for (const key of '__STYLE_NUMBERS__'.split(',')) add(key, 'Double', '布局');
      for (const key of '__STYLE_STRINGS__'.split(',')) add(key, 'String', '基础外观');
      for (const key of 'testID,accessibilityLabel,accessibilityHint,accessibilityValue'.split(',')) add(key, 'String', '基础外观');
      if (node.tag === 'Text') add('text','String','文本');
      if (node.tag === 'Button') { add('title','String','文本'); add('disabled','Boolean','基础外观'); }
      if (node.tag === 'TextInput') { for (const key of ['value','placeholder']) add(key,'String','文本'); add('editable','Boolean','文本'); }
      if (node.tag === 'Image' || node.tag === 'Video') add('src','String','基础外观');
      if (node.tag === 'ScrollView') add('scrollEnabled','Boolean','基础外观');
    }
    return definitions;
  }
  private async devtoolsCommand(surface: Surface, command: { type: string; id?: number; requestId?: string; expiresAt?: number; key?: string; target?: string; value?: unknown; schemaToken?: string; sample?: number; on?: boolean }): Promise<Record<string, unknown>> {
    const session = this.devtoolsSessions.get(surface.id);
    if (!session || (command.expiresAt !== undefined && command.expiresAt <= Date.now())) throw new Error('COMMAND_EXPIRED');
    const id = command.id ?? 0;
    const nodes = this.devtoolsNodes(surface);
    const node = nodes.find(node => node.id === id);
    if (command.type === 'shot' || command.type === 'live') {
      if (command.type === 'live') { session.live = command.on === true; session.sample = command.sample ?? 2; return {}; }
      if (id !== 0 && !node) throw new Error('UNKNOWN_NODE');
      await this.devtoolsCapture(surface, id, command.sample ?? 1, false);
      if (session.screenshot?.err) throw new Error(session.screenshot.err);
      return {};
    }
    if (!node) throw new Error('UNKNOWN_NODE');
    if (command.type === 'state') return {id, state:node.state};
    const properties = this.devtoolsSchema(surface, id);
    const schemaToken = session.id + ':' + id + ':' + properties.map(p => p.key + ':' + p.wireType).join(',');
    if (command.type === 'inspectProps') return {id, schemaVersion:1, schemaToken, properties};
    if (command.type !== 'set') throw new Error('UNSUPPORTED_COMMAND');
    if (surface.pending || !surface.visible || this.devtoolsWaiters.has(surface.id)) throw new Error('PAGE_BUSY');
    if (command.schemaToken && command.schemaToken !== schemaToken) throw new Error('STALE_SCHEMA');
    const key = command.key ?? '';
    const type = this.devtoolsWireType(command.value);
    const frame = surface.frames.get(node.path);
    const previousOverride = this.devtoolsOverrides.get(surface.id)?.get(node.path);
    let editedSlot: StateSlot | undefined;
    let updateId = 0;
    if (command.target === 's') {
      const match = /^state\[(\d+)\]$/.exec(key);
      const slot = match && frame?.slots[Number(match[1])];
      if (!slot || slot.kind !== 'state' || !type || type !== this.devtoolsWireType(slot.value)) throw new Error('READ_ONLY_FIELD');
      editedSlot = slot;
      slot.dispatch(command.value); updateId = slot.pending.at(-1)?.id ?? 0;
    } else if (command.target === 'p') {
      const definition = properties.find(p => p.key === key);
      if (!definition || !type || definition.wireType !== type) throw new Error('INVALID_PROPERTY_VALUE');
      if (type === 'String' && String(command.value).length > 4096) throw new Error('INVALID_PROPERTY_VALUE');
      if (id > 0 && /color$/i.test(key) && command.value !== 'transparent' && !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(command.value))) throw new Error('INVALID_PROPERTY_VALUE');
      const nonnegative = 'width,height,minWidth,minHeight,maxWidth,maxHeight,padding,paddingTop,paddingRight,paddingBottom,paddingLeft,gap,rowGap,columnGap,fontSize,lineHeight,borderWidth,borderRadius,flexGrow,flexShrink';
      if (id > 0 && type === 'Double' && nonnegative.split(',').includes(key) && Number(command.value) < 0) throw new Error('INVALID_PROPERTY_VALUE');
      if (id > 0 && key === 'opacity' && (Number(command.value) < 0 || Number(command.value) > 1)) throw new Error('INVALID_PROPERTY_VALUE');
      const enums: Record<string,string> = {flexDirection:'row,column,row-reverse,column-reverse',justifyContent:'flex-start,flex-end,center,space-between,space-around,space-evenly',alignItems:'stretch,flex-start,flex-end,center,baseline',alignSelf:'auto,stretch,flex-start,flex-end,center,baseline',position:'relative,absolute',visibility:'visible,hidden',overflow:'visible,hidden,scroll',fontWeight:'normal,bold',fontStyle:'normal,italic',textAlign:'left,center,right,justify',flexWrap:'nowrap,wrap,wrap-reverse'};
      if (id > 0 && enums[key] && !enums[key].split(',').includes(String(command.value))) throw new Error('INVALID_PROPERTY_VALUE');
      let overrides = this.devtoolsOverrides.get(surface.id);
      if (!overrides) { overrides = new Map(); this.devtoolsOverrides.set(surface.id, overrides); }
      const override = {...(overrides.get(node.path) ?? {})};
      if (id > 0 && ('__STYLE_NUMBERS__,__STYLE_STRINGS__').split(',').includes(key)) override.style = {...(override.style as object ?? {}), [key]:command.value};
      else override[key] = command.value;
      overrides.set(node.path, override);
      surface.dirty = true;
    } else throw new Error('READ_ONLY_FIELD');
    const timeout = Math.max(1, Math.min(5000, (command.expiresAt ?? Date.now() + 5000) - Date.now()));
    try { await new Promise<void>((resolve, reject) => {
      const timer = timeoutInScope(surface.timerScope, () => { this.devtoolsWaiters.delete(surface.id); reject(new Error('COMMIT_TIMEOUT')); }, timeout);
      this.devtoolsWaiters.set(surface.id, {resolve, reject, timer});
      this.onWake?.();
    }); } catch (error) {
      const overrides = this.devtoolsOverrides.get(surface.id);
      if (previousOverride) overrides?.set(node.path, previousOverride); else overrides?.delete(node.path);
      if (editedSlot) editedSlot.pending = editedSlot.pending.filter(update => update.id !== updateId);
      if (this.surfaces.get(surface.id) === surface) {surface.dirty = true; this.onWake?.();}
      throw error;
    }
    const readback = this.devtoolsNodes(surface).find(n => n.id === id);
    if (!readback) throw new Error('NODE_REMOVED');
    return {id, value:command.target === 's' ? readback.state[key] : readback.props[key]};
  }
  private async devtoolsCapture(surface: Surface, id: number, sample: number, live: boolean): Promise<void> {
    const session = this.devtoolsSessions.get(surface.id);
    if (!session) return;
    try {
      const nodes = this.devtoolsNodes(surface);
      const node = nodes.find(node => node.id === id);
      const rect = node ? {...node.rect} : undefined;
      if (rect && node) {
        let parent = nodes.find(candidate => candidate.id === node.parentId);
        while (parent) {
          if (parent.scrollOffset) { rect.x -= parent.scrollOffset[0]; rect.y -= parent.scrollOffset[1]; }
          parent = nodes.find(candidate => candidate.id === parent!.parentId);
        }
      }
      let data = '', offset = 0;
      let captured: {chunk:string; next:number; ox?:number; oy?:number; ow?:number; oh?:number};
      do {
        captured = JSON.parse(await this.invokeModule(surface, session.owner, '__devtools', 'capture', JSON.stringify({id, sample, offset, rect}))) as {chunk:string; next:number; ox?:number; oy?:number; ow?:number; oh?:number};
        if (typeof captured.chunk !== 'string' || !Number.isInteger(captured.next) || captured.next < 0 || captured.next && captured.next <= offset) throw new Error('INVALID_CAPTURE_CHUNK');
        data += captured.chunk; offset = captured.next;
        if (data.length > 2000000) throw new Error('CAPTURE_TOO_LARGE');
      } while (offset && session.owner.active);
      session.screenshot = {id, sample, ts:Date.now(), live, data, ox:captured.ox, oy:captured.oy, ow:captured.ow, oh:captured.oh};
    } catch (error) { session.screenshot = {id, sample, ts:Date.now(), live, err:String(error)}; }
    session.lastShot = Date.now(); session.shotRevision = surface.revision;
  }
