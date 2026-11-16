# GitHub Pages 배포 준비

이번 작업은 로컬 설정 준비만 수행했다. 저장소 생성, 공개 범위 변경, Git 초기화/커밋/푸시, Actions 실행과 실제 배포는 하지 않았다.

## 무료 이용과 저장소

예상 저장소 이름은 대소문자까지 `MediaFit-Studio`다. **GitHub Free로 GitHub Pages를 사용하려면 Public 저장소가 필요하다.** Private 저장소의 Pages는 지원되는 유료 플랜이 필요하다. Public 저장소에는 소스도 공개되므로 사용자가 공개 여부를 직접 결정해야 한다. [GitHub 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 현재 설정

- `vite.config.ts`: `base: '/MediaFit-Studio/'`. 계정명에 의존하지 않고 프로젝트 Pages 하위 경로를 사용한다. 저장소 이름이나 사용자 도메인이 바뀌면 base를 수정해야 한다. [Vite 배포 문서](https://vite.dev/guide/static-deploy)
- 홈 링크: `import.meta.env.BASE_URL`로 이동한다. JS/CSS는 Vite가 base 경로를 붙이고, 업로드/저장 이미지는 로컬 Blob URL이므로 배포 경로의 영향을 받지 않는다.
- 앱은 하나의 화면이며 History API 라우터가 없다. `/MediaFit-Studio/`에서 새로고침하는 방식으로 사용한다. 임의의 `/MediaFit-Studio/editor` 같은 경로는 지원하지 않으므로 404.html 복사/리다이렉트는 추가하지 않았다. 향후 라우터 추가 시 별도 설계한다.
- `.github/workflows/pages.yml`: **workflow_dispatch만** 선언했다. push/PR로 자동 배포하지 않는다. 사용자가 수동 실행하면 Ubuntu에서 Node 22로 `npm ci`, 타입 검사, 빌드 후 `dist/`만 업로드·배포한다. build와 deploy는 순차 실행한다.
- 빌드에는 contents 읽기만, 배포 작업에만 pages/id-token 쓰기를 부여한다. 별도 개인 액세스 토큰은 필요 없다. 실행 파일은 GitHub 공식 Actions를 사용한다. [워크플로 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 사용자가 승인 후 진행할 절차

1. 배포 전 아래 파일 점검과 작은 이미지의 수동 브라우저 검증을 끝낸다.
2. 사용자가 저장소 이름/공개 범위를 확정하고 직접 생성하거나 별도로 생성 작업을 승인한다. 이번 작업에서는 생성하지 않았다.
3. 소스와 `package-lock.json`, 워크플로를 검토해 커밋/푸시한다. `node_modules/`와 `dist/`는 저장소에 올리지 않는다.
4. Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 선택한다. workflow_dispatch 파일은 기본 브랜치에 있어야 한다.
5. Actions → Deploy MediaFit Studio to GitHub Pages → Run workflow를 수동 실행한다. 실제 게시 작업이므로 공개할 준비가 되었을 때만 실행한다.
6. 성공 후 `https://<계정명>.github.io/MediaFit-Studio/`에서 새로고침, 홈 링크, 리소스 요청과 모바일 파일 저장을 확인한다. 이 주소는 예상 형식이며 아직 생성된 URL이 아니다.

## 로컬 확인

`npm.cmd run dev`로 시작하고 터미널의 `/MediaFit-Studio/` 주소를 사용한다. 일반적으로 `http://127.0.0.1:5173/MediaFit-Studio/`다. 빌드한 결과는 `npm.cmd run preview`로 열며 일반적으로 `http://127.0.0.1:4173/MediaFit-Studio/`다. 사용 중인 포트에 따라 번호가 바뀔 수 있다. `dist/index.html`을 파일 탐색기에서 직접 열지 않는다.

모바일용 viewport/반응형 UI/하단 안전 영역 설정은 유지했다. 모바일 지원을 위해 개발 서버를 외부 네트워크에 자동 공개하지 않는다. 실제 Pages 모바일 브라우저에서 붙여넣기·Canvas 블러·JPG/WebP 인코딩·다운로드는 별도 확인해야 한다.

## 개인 파일과 비밀 점검

현재 소스 목록에서 개인 이미지·영상·환경 변수·키 파일은 발견되지 않았다. 일반적인 private key/GitHub token/AWS access key 형태도 검색 결과가 없었다. 이는 완전한 비밀 탐지나 과거 Git 이력 검사가 아니다. 작업 폴더에 `.git` 디렉터리가 없어 추적 목록/원격 설정을 이 작업에서 확인하지 않았다.

`.gitignore`에는 `.env*`, `.npmrc`, `.aws/`, `.ssh/`, 개인 도구 설정, 키 파일, 로그, 흔한 이미지/영상 확장자와 개인 미디어 폴더를 제외했다. 이미지에 임베드된 위치/촬영 정보도 있을 수 있으므로 개인 파일을 예제용으로 추가하지 않는다. 나중에 공개 가능한 브랜드 이미지가 필요하면 해당 파일만 검토 후 명시적으로 허용한다. 현재 UI 아이콘은 코드 내부 SVG이므로 이미지 파일 예외가 필요 없다.

`.gitignore`는 이미 추적 중인 파일을 제거하지 않으며 모든 확장자나 이름을 완벽히 잡지 못한다. 또한 Vite의 `public/` 파일은 로컬 빌드에 복사될 수 있으므로 개인 파일을 그 폴더에 넣으면 안 된다. 실제 푸시 전 변경 파일·추적 파일·과거 이력과 `dist/` 내용을 직접 확인한다. Pages에는 `dist/`만 게시하며 `docs/` 연구 문서나 프로젝트 전체를 배포 산출물로 올리지 않는다.

GitHub Free 정책, Actions 버전과 플랜 제한은 실제 배포 시점에 다시 확인한다. 현재 GitHub Actions 원격 실행은 미검증이다.
