# rigidpointadvisory.com

Rigid Point Advisory 회사 사이트 (정적 HTML, GitHub Pages).

- `index.html` — 회사 소개 한 페이지 (하는 일 / VI One / 대표 / 연락처)
- `app/index.html` — **명함 QR이 가리키는 스마트 링크.** iOS·데스크톱은 App Store로, 안드로이드는 홈으로 보냅니다.
  안드로이드 출시 후 `app/index.html`의 `var AND = ''` 에 Google Play URL만 넣으면 됩니다. **명함은 다시 안 찍어도 됩니다.**
- `CNAME` — rigidpointadvisory.com
- 배포: `deploy-rpa.ps1` (최초 1회 레포 생성·푸시·Pages 설정) / 이후 수정은 `git add -A; git commit -m "update"; git push`

App Store 링크는 국가 없는 주소(`https://apps.apple.com/app/id6774170446`)를 써서 방문자 나라의 스토어로 자동 연결됩니다.
