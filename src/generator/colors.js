const colors = {
  dark: {
    C: '#fff',
    O: '#e74c3c',
    N: '#3498db',
    F: '#27ae60',
    CL: '#16a085',
    BR: '#d35400',
    I: '#8e44ad',
    P: '#d35400',
    S: '#f1c40f',
    B: '#e67e22',
    SI: '#e67e22',
    H: '#fff',
    BACKGROUND: '#141414'
  },
  light: {
    C: '#222',
    O: '#e74c3c',
    N: '#3498db',
    F: '#27ae60',
    CL: '#16a085',
    BR: '#d35400',
    I: '#8e44ad',
    P: '#d35400',
    S: '#f1c40f',
    B: '#e67e22',
    SI: '#e67e22',
    H: '#222',
    BACKGROUND: '#fff'
  }
}
colors.mono = Object.keys(colors.dark).reduce((prev, curr) => {
  prev[curr] = '#000'
  return prev
}, {})

module.exports = colors
