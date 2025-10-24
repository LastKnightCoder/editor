; 自定义 NSIS 安装脚本
; 用于注册文件夹右键菜单

!macro customInstall
  ; 注册文件夹右键菜单 - "使用 Tau 打开"
  WriteRegStr HKCR "Directory\shell\OpenWithTau" "" "使用 Tau 打开"
  WriteRegStr HKCR "Directory\shell\OpenWithTau" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "Directory\shell\OpenWithTau\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  
  ; 注册文件夹背景右键菜单（在文件夹空白处右键）
  WriteRegStr HKCR "Directory\Background\shell\OpenWithTau" "" "在 Tau 中打开"
  WriteRegStr HKCR "Directory\Background\shell\OpenWithTau" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "Directory\Background\shell\OpenWithTau\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  
  ; 注册为 Markdown 文件的打开方式
  WriteRegStr HKCR ".md\OpenWithProgids" "TauMarkdown" ""
  WriteRegStr HKCR ".markdown\OpenWithProgids" "TauMarkdown" ""
  
  WriteRegStr HKCR "TauMarkdown" "" "Tau Markdown File"
  WriteRegStr HKCR "TauMarkdown\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "TauMarkdown\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; 在 Markdown 文件右键菜单中添加"使用 Tau 打开"选项
  WriteRegStr HKCR ".md\shell\OpenWithTau" "" "使用 Tau 打开"
  WriteRegStr HKCR ".md\shell\OpenWithTau" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR ".md\shell\OpenWithTau\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  WriteRegStr HKCR ".markdown\shell\OpenWithTau" "" "使用 Tau 打开"
  WriteRegStr HKCR ".markdown\shell\OpenWithTau" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR ".markdown\shell\OpenWithTau\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  ; 清理文件夹右键菜单
  DeleteRegKey HKCR "Directory\shell\OpenWithTau"
  DeleteRegKey HKCR "Directory\Background\shell\OpenWithTau"
  
  ; 清理 Markdown 文件关联
  DeleteRegKey HKCR "TauMarkdown"
  DeleteRegValue HKCR ".md\OpenWithProgids" "TauMarkdown"
  DeleteRegValue HKCR ".markdown\OpenWithProgids" "TauMarkdown"
  
  ; 清理 Markdown 文件右键菜单
  DeleteRegKey HKCR ".md\shell\OpenWithTau"
  DeleteRegKey HKCR ".markdown\shell\OpenWithTau"
!macroend

