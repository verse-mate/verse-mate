import { Button } from "../Button/Button";
import { Text } from "../Text/Text";
import styles from "./Table.module.css";

const MIN_PAGE_TO_BREAKPOINT = 5;
const DYNAMIC_PAGES_LENGTH = 3;
const DYNAMIC_PAGES_LENGTH_2 = 4;

function getPaginationCount({
  currentPage,
  totalResults,
  take,
}: {
  currentPage: number;
  totalResults: number;
  take: number;
}) {
  const multiplyResult = currentPage * take;

  const currentPageMaxResults =
    multiplyResult > totalResults ? totalResults : multiplyResult;

  const currentPageMinResults =
    totalResults === 0 ? 0 : multiplyResult - take + 1;

  return `${currentPageMinResults} - ${currentPageMaxResults}`;
}

interface Actions {
  onClickPrevious: () => void;
  onClickNext: () => void;
  onClickPage: (page: number) => void;
}

export interface PaginationProps extends Actions {
  currentPage: number;
  totalResults: number;
  totalPages: number;
  take: number;
}

const getDynamicButtonsLength = ({
  totalPages,
  currentPage,
}: {
  totalPages: number;
  currentPage: number;
}) => {
  return totalPages > MIN_PAGE_TO_BREAKPOINT
    ? currentPage < DYNAMIC_PAGES_LENGTH ||
      currentPage >= totalPages - DYNAMIC_PAGES_LENGTH
      ? DYNAMIC_PAGES_LENGTH_2
      : DYNAMIC_PAGES_LENGTH
    : totalPages;
};

const getButtonNumber = ({
  currentPage,
  totalPages,
  index,
}: {
  currentPage: number;
  totalPages: number;
  index: number;
}) => {
  const ifLeftSide =
    currentPage < DYNAMIC_PAGES_LENGTH || totalPages <= MIN_PAGE_TO_BREAKPOINT
      ? index + 1
      : currentPage + index;

  return currentPage >= totalPages - DYNAMIC_PAGES_LENGTH &&
    totalPages > MIN_PAGE_TO_BREAKPOINT
    ? totalPages - DYNAMIC_PAGES_LENGTH + index
    : ifLeftSide;
};

export const Pagination = ({
  currentPage,
  take,
  totalPages,
  totalResults,
  onClickNext,
  onClickPage,
  onClickPrevious,
}: PaginationProps) => {
  return (
    <div className={styles.paginationContainer}>
      <Text className={styles.paginationText}>
        {"Showing"}{" "}
        <b>
          {getPaginationCount({
            currentPage: currentPage + 1,
            take,
            totalResults,
          })}
        </b>{" "}
        {"of"} <b>{totalResults}</b> {totalResults === 1 ? "result" : "results"}
      </Text>

      <nav
        className={styles.paginationButtonsContainer}
        aria-label="pagination"
      >
        <Button
          variant="outlined"
          disabled={currentPage === 0}
          onClick={onClickPrevious}
        >
          {"Previous"}
        </Button>

        <div
          hidden={totalPages === 1}
          className={styles.paginationNumberButtonsContainer}
        >
          {totalPages > MIN_PAGE_TO_BREAKPOINT &&
            currentPage >= DYNAMIC_PAGES_LENGTH && (
              <>
                <Button
                  name={`page-${totalPages}`}
                  aria-label={`page-${totalPages}`}
                  aria-current={currentPage === 0 ? "page" : undefined}
                  onClick={() => {
                    onClickPage(1);
                  }}
                  variant={currentPage === 0 ? "contained" : "outlined"}
                >
                  {1}
                </Button>
                <div className={styles.paginationThreeDots}>...</div>
              </>
            )}

          {/* Dynamic buttons */}
          {new Array(
            getDynamicButtonsLength({
              currentPage,
              totalPages,
            }),
          )
            .fill("")
            .map((_value, index) => {
              const buttonNumber = getButtonNumber({
                currentPage,
                totalPages,
                index,
              });

              return (
                <Button
                  key={buttonNumber}
                  name={`page-${buttonNumber}`}
                  aria-label={`page-${buttonNumber}`}
                  aria-current={
                    currentPage === buttonNumber - 1 ? "page" : undefined
                  }
                  onClick={() => {
                    onClickPage(buttonNumber);
                  }}
                  variant={
                    currentPage === buttonNumber - 1 ? "contained" : "outlined"
                  }
                >
                  {buttonNumber}
                </Button>
              );
            })}

          {totalPages > MIN_PAGE_TO_BREAKPOINT &&
            currentPage < totalPages - DYNAMIC_PAGES_LENGTH && (
              <>
                <div className={styles.paginationThreeDots}>...</div>
                <Button
                  // name={`page-${totalPages}`}
                  aria-label={`page-${totalPages}`}
                  aria-current={currentPage === totalPages ? "page" : undefined}
                  onClick={() => {
                    onClickPage(totalPages);
                  }}
                  variant={
                    currentPage === totalPages - 1 ? "contained" : "outlined"
                  }
                >
                  {totalPages}
                </Button>
              </>
            )}
        </div>

        <Button
          variant="contained"
          disabled={currentPage === totalPages - 1 || totalPages === 0}
          onClick={onClickNext}
        >
          {"Next"}
        </Button>
      </nav>
    </div>
  );
};
