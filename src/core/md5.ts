/**
 * 计算 MD5 十六进制摘要。百度通用翻译接口使用 MD5 签名，而 Web Crypto
 * 不提供 MD5，因此这里保留一个小型、无依赖的实现供扩展和在线演示共用。
 */
export function md5Hex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = ((bytes.length + 8) >> 6 << 6) + 64
  const input = new Uint8Array(paddedLength)
  input.set(bytes)
  input[bytes.length] = 0x80
  const view = new DataView(input.buffer)
  view.setUint32(paddedLength - 8, bitLength >>> 0, true)
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000))

  for (let offset = 0; offset < input.length; offset += 64) {
    const words = new Uint32Array(16)
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f: number
      let wordIndex: number
      if (index < 16) {
        f = (b & c) | (~b & d)
        wordIndex = index
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        wordIndex = (5 * index + 1) % 16
      } else if (index < 48) {
        f = b ^ c ^ d
        wordIndex = (3 * index + 5) % 16
      } else {
        f = c ^ (b | ~d)
        wordIndex = (7 * index) % 16
      }
      const next = (a + f + constants[index]! + words[wordIndex]!) >>> 0
      const shift = shifts[index]!
      const rotated = (next << shift) | (next >>> (32 - shift))
      const previousD = d
      d = c
      c = b
      b = (b + rotated) >>> 0
      a = previousD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, word >>> 24])
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
