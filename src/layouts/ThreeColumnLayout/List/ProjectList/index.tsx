import useProjectsStore from "@/stores/useProjectsStore";

import Projects from './Projects';
import Project from './Project';

const ProjectList = () => {
  const {
    activeProjectId,
  } = useProjectsStore(state => ({
    activeProjectId: state.activeProjectId,
  }));

  if (!activeProjectId) {
    return <Projects />
  }

  return <Project />;
}

export default ProjectList;
