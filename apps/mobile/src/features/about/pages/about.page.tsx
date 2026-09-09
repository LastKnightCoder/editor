import { AboutPage } from "../AboutPage";
import { definePage, useNavigator } from "../../../router";

function AboutScreen() {
  const navigator = useNavigator();
  return <AboutPage onBack={() => navigator.goBack("ui")} />;
}

export default definePage({
  key: "about",
  match: "single",
  params: {},
  component: AboutScreen,
});
