#include <windows.h>
#include <appmodel.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Globalization.h>
#include <winrt/Windows.Media.SpeechRecognition.h>
#include <iostream>

// 只探测身份、语言和识别器构造，不采集麦克风或发送音频。
int main() {
    winrt::init_apartment();
    UINT32 length = 0;
    std::cout << "packageIdentityStatus=" << GetCurrentPackageFullName(&length, nullptr) << '\n';
    try {
        using namespace winrt::Windows::Media::SpeechRecognition;
        for (auto const& language : SpeechRecognizer::SupportedGrammarLanguages()) {
            std::cout << "grammarLanguage=" << winrt::to_string(language.LanguageTag()) << '\n';
        }
        SpeechRecognizer recognizer{winrt::Windows::Globalization::Language{L"zh-CN"}};
        std::cout << "recognizerCreated=true\n";
        recognizer.Constraints().Append(SpeechRecognitionListConstraint{{L"测试"}});
        std::cout << "listCompile=" << static_cast<int>(recognizer.CompileConstraintsAsync().get().Status()) << '\n';
        recognizer.Constraints().Clear();
        recognizer.Constraints().Append(SpeechRecognitionTopicConstraint{SpeechRecognitionScenario::Dictation, L"dictation"});
        std::cout << "dictationCompile=" << static_cast<int>(recognizer.CompileConstraintsAsync().get().Status()) << '\n';
        recognizer.Close();
        return 0;
    } catch (winrt::hresult_error const& error) {
        std::cout << "hresult=0x" << std::hex << static_cast<unsigned long>(error.code().value) << '\n';
        return 1;
    }
}
