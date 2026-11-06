# 지역별 관광지 조회 및 찜하기 웹앱

프런트엔드: 순수 HTML/CSS/JavaScript (GitHub Pages)
데이터 조회: 한국관광공사 국문 관광정보 서비스 (KorService2)
안전한 API 키 보관/프록시: Firebase Cloud Functions + Secret Manager
사용자 찜 보관함: Firebase Authentication 익명 인증 + Realtime Database

## 중요한 주의사항

- Firebase Cloud Functions 배포에는 Blaze 요금제와 결제 계정이 필요합니다. 무료 할당량이 있지만 초과하면 비용이 발생할 수 있습니다.
- 한국관광공사 API 인증키는 GitHub에 올리거나 app.js에 적지 마세요.
- Firebase 웹 설정의 apiKey는 (Firebase 전용 제한사항을 적용한 경우) 공개 클라이언트 식별자로 사용되며, 보호는 Database 보안 규칙이 담당합니다.
- 익명 인증으로 저장하는 찜 목록은 동일한 브라우저의 로그인 상태를 유지해야 다시 볼 수 있습니다. 브라우저 저장소 삭제나 다른 기기에서는 계정이 달라질 수 있습니다.

## 설정 절차

1. 공공데이터포털(data.go.kr)에서 '한국관광공사 국문 관광정보 서비스_GW' 활용신청 후 인증키(Decoding 원본)를 준비합니다.
2. Firebase 프로젝트를 만들고, Blaze 결제 계정을 연결하고, Realtime Database를 생성하고, Authentication > 익명 로그인을 켭니다.
3. Realtime Database > 규칙 화면에 `database.rules.json`의 내용을 붙여넣고 게시합니다.
4. Firebase 프로젝트 설정 > 일반 > 웹 앱에서 firebaseConfig를 복사해 `app.js`의 맨 위 값들을 교체합니다. databaseURL은 Realtime Database 화면의 실제 주소를 사용합니다.
5. Mac 터미널에서 프로젝트 폴더로 이동합니다.
6. Node.js 22 설치 여부를 `node -v`, `npm -v`로 확인합니다.
7. `npm install -g firebase-tools` 후 `firebase login`을 실행합니다.
8. 프로젝트 폴더 루트에서 `firebase init functions`를 실행하고, 기존 Firebase 프로젝트, JavaScript, ESLint 미사용, 의존성 설치 Yes를 선택합니다. 현재 functions/index.js를 코드로 교체합니다.
9. `functions/package.json` 안의 `engines.node`가 `22`인지 확인하고 아니라면 수정합니다.
10. 루트에서 `firebase functions:secrets:set TOUR_API_KEY`를 실행합니다. 물어보는 값에 관광정보 API Decoding 키를 입력합니다.
11. 루트에서 `firebase deploy --only functions`를 실행합니다.
12. 루트에서 `python3 -m http.server 5500`을 실행하고 `http://localhost:5500`으로 이동해 기능을 시험합니다.
13. GitHub 새 공개 저장소의 맨 위 경로에 `index.html`, `favorites.html`, `style.css`, `app.js`를 올립니다. `functions/node_modules` 및 API 인증키는 절대 업로드하지 않습니다.
14. GitHub 저장소 Settings > Pages > Build and deployment > Source: Deploy from a branch > Branch: main > Folder: /(root) > Save로 배포합니다.

**중요:** `firebase init functions`가 functions/index.js를 다시 작성할 수 있습니다. init을 먼저 실행하고 다운로드한 functions/index.js를 복사하세요.

## 동작

- 첫 화면에서 법정동 지역 목록 API(`ldongCode2`)를 호출해 최신 지역 코드를 가져옵니다.
- 지역 선택 시 `areaBasedList2`의 `lDongRegnCd`로 관광지 정보를 조회합니다.
- `arrange=O`는 대표 이미지가 있는 결과를 요청합니다.
- 찜 정보는 `users/{uid}/favorites/{contentid}` 구조로 저장합니다.

## 오류 체크

- `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`: 포털에서 해당 API 승인 여부, 키의 올바른 종류(Decoding), 인증키 상태를 확인합니다.
- `403`: Cloud Functions 로그에서 한국관광공사 API 응답과 사용량/권한을 확인합니다.
- `auth/operation-not-allowed`: Firebase Authentication에서 Anonymous 로그인을 켭니다.
- `permission_denied`: Realtime Database 보안 규칙이 맞는지, Authentication 사용자 UID가 일치하는지 확인합니다.
- 이미지 없음: TourAPI 이미지의 HTTPS 지원/원본 데이터 확인이 필요합니다.

## 공식 참고자료

- https://www.data.go.kr/data/15101578/openapi.do
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/functions/config-env
- https://firebase.google.com/docs/auth/web/anonymous-auth
- https://firebase.google.com/docs/database/security/index
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
