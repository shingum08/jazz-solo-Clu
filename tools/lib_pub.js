/* v0.42.1 앱에 실리는 문구에서 참고 자료(책 이름·권·쪽)를 뺀다.
   원본 메모(권·쪽 포함)는 개발 자료 tools/data/ 에만 남기고, engine/(앱에 들어가는 파일)에는 이 함수를 거친 문구만 쓴다. */
'use strict';
function pubNote(s){
  if(!s)return s;
  s=String(s)
    .replace(/리얼북\s*[1-3]권\s*[\d~·,\s]*쪽\s*(?:\(([^)]*)\))?\s*[.·,]?\s*/g,(m,who)=>who?who+'. ':'')
    .replace(/\bRB[1-3]\s*[\d~]+\b\s*[.·,]?\s*/g,'')
    .replace(/리얼북\s*[1-3](?:~[1-3])?권\s*/g,'').replace(/리얼북/g,'악보')
    .replace(/(^|[\s(·,])책(?=[\s의에은을이]|대로|$)/g,'$1악보');
  return s.replace(/^\s*[.·,]\s*/,'').replace(/\s{2,}/g,' ').trim();
}
module.exports={pubNote};
