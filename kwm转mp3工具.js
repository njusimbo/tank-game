// KWM (酷我音乐) 解密器 —— 独立实现，零第三方依赖
// 格式依据：https://deepwiki.com/jiangyalin/ncm-or-kgma-to-flac/4.3-kwm-format-(kuwo-music)
//   0x00-0x0F  16 字节魔术字 "yeelion-kuwo-tme"
//   0x18-0x1F  8 字节文件密钥（小端 uint64）
//   0x400+     加密音频数据（32 字节掩码循环 XOR）
//
// 用法：node _unlock_kwm.js <输入.kwm> [输出.mp3]
var fs = require('fs');
var path = require('path');

var MAGIC = 'yeelion-kuwo-tme';
var PRE_DEFINED_KEY = 'MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk';
var HEADER_SIZE = 0x400;

function trimKey(raw) {
  // 规范到恰好 32 字符：超长截断，不足则循环补足
  if (raw.length > 32) { return raw.slice(0, 32); }
  if (raw.length < 32) {
    var out = raw;
    while (out.length < 32) { out += raw; }
    return out.slice(0, 32);
  }
  return raw;
}

function buildMask(fileKeyBytes) {
  // 8 字节小端 → uint64 → 十进制字符串
  var keyNum = 0n;
  for (var i = 7; i >= 0; i--) { keyNum = (keyNum << 8n) | BigInt(fileKeyBytes[i]); }
  var keyStr = trimKey(keyNum.toString());
  var mask = Buffer.alloc(32);
  for (var j = 0; j < 32; j++) {
    mask[j] = PRE_DEFINED_KEY.charCodeAt(j) ^ keyStr.charCodeAt(j);
  }
  return mask;
}

function unlock(inputPath, outputPath) {
  var data = fs.readFileSync(inputPath);

  // 1) 校验魔术字
  var magic = data.slice(0, 16).toString('latin1');
  if (magic !== MAGIC) {
    throw new Error('不是有效的 KWM 文件（魔术字不匹配：' + JSON.stringify(magic) + '）');
  }

  // 2) 取文件密钥
  var fileKey = data.slice(0x18, 0x20);
  var mask = buildMask(fileKey);

  // 3) 解密音频段（掩码循环 XOR）
  var audio = Buffer.from(data.slice(HEADER_SIZE));
  for (var i = 0; i < audio.length; i++) {
    audio[i] ^= mask[i % 32];
  }

  // 4) 识别真实格式（应在解密后可见）
  var fmt = '';
  if (audio[0] === 0xFF && (audio[1] & 0xE0) === 0xE0) { fmt = 'MP3 (无 ID3 标签)'; }
  else if (audio.slice(0, 3).toString('latin1') === 'ID3') { fmt = 'MP3 (带 ID3 标签)'; }
  else if (audio.slice(0, 4).toString('latin1') === 'fLaC') { fmt = 'FLAC'; }
  else if (audio.slice(0, 4).toString('latin1') === 'RIFF') { fmt = 'WAV'; }
  else if (audio.slice(0, 4).toString('latin1') === 'OggS') { fmt = 'OGG'; }
  else { fmt = '未知（首 8 字节：' + audio.slice(0, 8).toString('hex') + '）'; }

  fs.writeFileSync(outputPath, audio);
  return {
    input: inputPath,
    output: outputPath,
    headerSize: HEADER_SIZE,
    encryptedBytes: data.length - HEADER_SIZE,
    decryptedBytes: audio.length,
    detectedFormat: fmt,
    firstBytes: audio.slice(0, 16).toString('hex')
  };
}

// ---- 命令行入口 ----
if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('用法: node _unlock_kwm.js <输入.kwm> [输出.mp3]');
    process.exit(1);
  }
  var inp = args[0];
  var out = args[1] || inp.replace(/\.kwm$/i, '') + '.mp3';
  try {
    var r = unlock(inp, out);
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.log('解密失败: ' + e.message);
    process.exit(1);
  }
}

module.exports = { unlock: unlock };
