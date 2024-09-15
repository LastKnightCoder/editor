export const enum EStyledColor {
  Red = 'red',
  Green = 'green',
  Yellow = 'yellow',
  Blue = 'blue',
  Purple = 'purple',
  Gray = 'gray',
}

export const StyledTextColorStyle = {
  light: {
    [EStyledColor.Red]: {
      label: EStyledColor.Red,
      color: '#721C24',
      backgroundColor: '#F8D7DA'
    },
    [EStyledColor.Green]: {
      label: EStyledColor.Green,
      color: '#155724',
      backgroundColor: '#D4EDDA'
    },
    [EStyledColor.Yellow]: {
      label: EStyledColor.Yellow,
      color: '#856404',
      backgroundColor: '#FFF3CD'
    },
    [EStyledColor.Blue]: {
      label: EStyledColor.Blue,
      color: '#0C5460',
      backgroundColor: '#D1ECF1'
    },
    [EStyledColor.Purple]: {
      label: EStyledColor.Purple,
      color: '#6A1B9A',
      backgroundColor: '#EAE7FF'
    },
    [EStyledColor.Gray]: {
      label: EStyledColor.Gray,
      color: '#383D41',
      backgroundColor: '#ECEFF1'
    },
  },
  dark: {
    [EStyledColor.Red]: {
      label: EStyledColor.Red,
      color: '#F8D7DA',
      backgroundColor: '#721C24'
    },
    [EStyledColor.Green]: {
      label: EStyledColor.Green,
      color: '#D4EDDA',
      backgroundColor: '#155724'
    },
    [EStyledColor.Yellow]: {
      label: EStyledColor.Yellow,
      color: '#FFF3CD',
      backgroundColor: '#856404'
    },
    [EStyledColor.Blue]: {
      label: EStyledColor.Blue,
      color: '#D1ECF1',
      backgroundColor: '#0C5460'
    },
    [EStyledColor.Purple]: {
      label: EStyledColor.Purple,
      color: '#EAE7FF',
      backgroundColor: '#6A1B9A'
    },
    [EStyledColor.Gray]: {
      label: EStyledColor.Gray,
      color: '#ECEFF1',
      backgroundColor: '#383D41'
    },
  }
}