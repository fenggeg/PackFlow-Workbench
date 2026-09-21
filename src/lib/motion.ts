import {motion} from 'motion/react'

// 设计规范（DESIGN.md）：动效 ≤150ms、ease-out、仅 transition 类动效、无弹跳
// 用户要求更有感知的动效：适度放大位移与时长，仍保持克制、无弹跳
export const MOTION_DURATION = 0.22
export const MOTION_EASE = [0.2, 0, 0, 1] as const

export const fadeIn = {
  initial: {opacity: 0},
  animate: {opacity: 1},
  exit: {opacity: 0},
  transition: {duration: MOTION_DURATION, ease: MOTION_EASE},
}

export const slideInRight = {
  initial: {opacity: 0, x: 32},
  animate: {opacity: 1, x: 0},
  exit: {opacity: 0, x: 32},
  transition: {duration: MOTION_DURATION, ease: MOTION_EASE},
}

export const slideInLeft = {
  initial: {opacity: 0, x: -32},
  animate: {opacity: 1, x: 0},
  exit: {opacity: 0, x: -32},
  transition: {duration: MOTION_DURATION, ease: MOTION_EASE},
}

export const slideInUp = {
  initial: {opacity: 0, y: 16},
  animate: {opacity: 1, y: 0},
  exit: {opacity: 0, y: 16},
  transition: {duration: MOTION_DURATION, ease: MOTION_EASE},
}

export const zoomIn = {
  initial: {opacity: 0, scale: 0.96},
  animate: {opacity: 1, scale: 1},
  exit: {opacity: 0, scale: 0.96},
  transition: {duration: MOTION_DURATION, ease: MOTION_EASE},
}

// 页面切换：位移 + 缩放 + 淡入，感知明显
export const pageTransition = {
  initial: {opacity: 0, y: 40, scale: 0.98},
  animate: {opacity: 1, y: 0, scale: 1},
  exit: {opacity: 0, y: -24, scale: 0.99},
  transition: {duration: 0.3, ease: MOTION_EASE},
}

export {motion}