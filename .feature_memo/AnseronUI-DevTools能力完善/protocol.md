# 合约

GET /__anseronui_devtools/api/inspect/{sessions,logs,network,native,nodes}；pagerId/q/status/level/tag/limit/offset，默认50最大200，过滤后分页。详情 /{logs,network,native,nodes}/{id}。
POST api/command：{pagerId,command:{type,id,target,key,value,schemaToken}}；set/inspectProps/state/shot 等待设备回执；full/sample/live 排队。
快照新增 editable、scrollOffset、screenshot、commandResults。命令由服务端生成 requestId 和 expiresAt，设备忽略过期命令。截图模块 __devtools.capture({id,sample,offset,rect}) → {chunk,next,ox,oy,ow,oh}，next=0完成。
