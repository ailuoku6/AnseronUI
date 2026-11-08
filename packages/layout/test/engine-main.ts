import { layoutProbe } from "./engine-probe.js";
import { DIRECTION_LTR, DIRECTION_RTL } from "@anseronui/layout";
for (let i = 0; i < 16; i++) {
  console.log(layoutProbe(45 + i * 7.25, 40 + i, i % 2 === 0 ? DIRECTION_LTR : DIRECTION_RTL));
}
