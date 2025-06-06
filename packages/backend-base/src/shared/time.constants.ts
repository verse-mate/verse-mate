const oneMinute = () => 60;

const oneHour = () => oneMinute() * 60;

const oneDay = () => oneHour() * 24;

const timeConstants = {
  oneMinute,
  oneHour,
  oneDay,
};

export default timeConstants;
